import AppKit
import SwiftUI
import WebKit

/// Insights: the charts and tables Plex builds when you ask about your money ("How did I do this
/// month?", "Plan my week"). The page is the web app's `/insights` route (the Ledger's AG Grid and
/// AG Charts widgets over your receipts, pots, bills and subscriptions), shown here in a web view.
/// It follows the newest page live, so when Plex builds one it appears without a reload.
struct InsightsPage: View {
    @State private var loadFailed = false
    @State private var reloads = 0

    var body: some View {
        // Exactly the space the window gives: a flexible page with no scroll view of its own would
        // otherwise ask the split view for the screen's full height.
        GeometryReader { geo in
            page.frame(width: geo.size.width, height: geo.size.height, alignment: .top)
        }
    }

    /// `?embed=mac`: the page draws see-through, over this window's own background.
    static var embedURL: URL {
        BrainSettings.webURL.appending(path: "insights").appending(queryItems: [URLQueryItem(name: "embed", value: "mac")])
    }

    private var page: some View {
        VStack(alignment: .leading, spacing: 0) {
            MWPageHeader(title: "Insights",
                         icon: MainSection.insights.icon,
                         subtitle: "Charts and tables Plex builds when you ask about your money. Ask “How did I do this month?” or “Plan my week”.") {
                Button { NSWorkspace.shared.open(BrainSettings.webURL.appending(path: "insights")) } label: {
                    MWLabel("Open in browser", icon: "arrow-up-right")
                }
                .mwButton(.secondary)
            }
            .padding(.horizontal, 40)
            .padding(.top, 14)
            .padding(.bottom, 6)

            ZStack {
                InsightsWebView(url: Self.embedURL, failed: $loadFailed)
                    .id(reloads)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if loadFailed {
                    MWEmptyState(symbol: "chart-column", title: "Insights can't load",
                                 message: "It comes from Plex on the web at \(BrainSettings.webURLString). Is pnpm dev running?",
                                 compact: false)
                        .overlay(alignment: .bottom) {
                            Button("Try again") { loadFailed = false; reloads += 1 }
                                .mwButton(.secondary)
                                .padding(.bottom, 40)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Plex.canvas)
                }
            }
            // The web page draws its own 24px gutter; line it up with the header's 40.
            .padding(.horizontal, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(alignment: .top) {
            MWAurora()
                .frame(height: 300)
                .ignoresSafeArea()
        }
        .background(Plex.canvas)
    }
}

/// A WKWebView for one page of Plex on the web. Links that leave the page open in the browser.
private struct InsightsWebView: NSViewRepresentable {
    let url: URL
    @Binding var failed: Bool

    func makeCoordinator() -> Coordinator { Coordinator(failed: $failed) }

    func makeNSView(context: Context) -> WebContainer {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.setValue(false, forKey: "drawsBackground")
        web.allowsBackForwardNavigationGestures = true
        web.load(URLRequest(url: url))
        return WebContainer(web: web)
    }

    func updateNSView(_ view: WebContainer, context: Context) {}

    /// Take the space offered and scroll inside it; never size the window to the page's height.
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: WebContainer, context: Context) -> CGSize? {
        proposal.replacingUnspecifiedDimensions(by: CGSize(width: 800, height: 600))
    }

    /// Holds the web view by its frame, with no size of its own: a WKWebView reports its page's
    /// size, which would grow the window to the page's height.
    final class WebContainer: NSView {
        let web: WKWebView
        init(web: WKWebView) {
            self.web = web
            super.init(frame: .zero)
            web.translatesAutoresizingMaskIntoConstraints = true
            web.autoresizingMask = [.width, .height]
            addSubview(web)
            setContentHuggingPriority(.defaultLow, for: .vertical)
            setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        }
        required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }
        override var intrinsicContentSize: NSSize { NSSize(width: NSView.noIntrinsicMetric, height: NSView.noIntrinsicMetric) }
        override func layout() {
            super.layout()
            web.frame = bounds
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var failed: Bool
        init(failed: Binding<Bool>) { _failed = failed }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let target = action.request.url else { return .allow }
            // Earlier pages (/insights/<id>) stay here; anything else is the web app proper.
            let sameSite = target.host == webView.url?.host && target.port == webView.url?.port
            if action.navigationType == .linkActivated, !(sameSite && target.path.hasPrefix("/insights")) {
                NSWorkspace.shared.open(target)
                return .cancel
            }
            return .allow
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            failed = true
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            failed = false
        }
    }
}
