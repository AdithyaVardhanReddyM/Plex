import AppKit
import Combine
import SwiftUI

/// First run, in three short steps: what Plex does, the access it needs, and the accounts it
/// reads. Done is kept in UserDefaults (`onboardingDone`); macOS quitting the app for a
/// permission brings it back at the same step (`onboardingStep`).
@MainActor
final class OnboardingWindow: NSObject, NSWindowDelegate {
    static let shared = OnboardingWindow()
    static let doneKey = "onboardingDone"
    static let stepKey = "onboardingStep"

    private(set) var window: NSWindow?
    /// Opens the main window at Connections (set by AppDelegate).
    var openConnections: () -> Void = {}

    static var isDone: Bool {
        get { UserDefaults.standard.bool(forKey: doneKey) }
        set { UserDefaults.standard.set(newValue, forKey: doneKey) }
    }

    func show(agent: AgentSession) {
        if window == nil {
            let view = OnboardingView(agent: agent, finish: { [weak self] connect in
                Self.isDone = true
                UserDefaults.standard.removeObject(forKey: Self.stepKey)
                self?.close()
                if connect { self?.openConnections() }
            })
            let window = OnboardingPanel(contentRect: NSRect(origin: .zero, size: OnboardingView.size),
                                         styleMask: [.borderless, .fullSizeContentView], backing: .buffered, defer: false)
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = true
            window.isMovableByWindowBackground = true
            window.appearance = NSAppearance(named: .aqua)
            window.isReleasedWhenClosed = false
            window.delegate = self
            window.contentViewController = NSHostingController(rootView: view)
            window.setContentSize(OnboardingView.size)
            window.center()
            self.window = window
        }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }

    func close() {
        window?.close()
    }

    func windowWillClose(_ notification: Notification) {
        window = nil
    }
}

/// Borderless, but still takes the keyboard (Return continues).
private final class OnboardingPanel: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

struct OnboardingView: View {
    static let size = CGSize(width: 760, height: 540)
    private static let radius: CGFloat = 24

    let agent: AgentSession
    let finish: (_ openConnections: Bool) -> Void
    @State private var step = min(2, UserDefaults.standard.integer(forKey: OnboardingWindow.stepKey))

    var body: some View {
        ZStack(alignment: .top) {
            Plex.canvas
            AuroraWash()
                .frame(height: 300)
            VStack(spacing: 0) {
                HStack {
                    Wordmark(size: 17, color: Plex.ink)
                    Spacer()
                    CircleCloseButton { finish(false) }
                }
                .padding(.horizontal, 28)
                .padding(.top, 22)

                Group {
                    switch step {
                    case 0: WelcomeStep()
                    case 1: AccessStep()
                    default: ConnectStep()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.horizontal, 40)
                .padding(.top, 14)
                .padding(.bottom, 18)
                .transition(.asymmetric(insertion: .opacity.combined(with: .offset(x: 16)), removal: .opacity))
                .id(step)

                footer
                    .padding(.horizontal, 28)
                    .padding(.bottom, 24)
            }
        }
        .frame(width: Self.size.width, height: Self.size.height)
        .clipShape(RoundedRectangle(cornerRadius: Self.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Self.radius, style: .continuous).strokeBorder(.black.opacity(0.08), lineWidth: 0.5))
        .animation(.spring(response: 0.32, dampingFraction: 0.88), value: step)
        .onChange(of: step) { UserDefaults.standard.set(step, forKey: OnboardingWindow.stepKey) }
    }

    private var footer: some View {
        ZStack {
            StepDots(count: 3, current: step)
            HStack {
                if step > 0 {
                    Button("Back") { step -= 1 }
                        .buttonStyle(CapsuleSecondaryButton(symbol: "arrow.left"))
                }
                Spacer()
                Button(step < 2 ? "Continue" : "Start using Plex") {
                    if step < 2 { step += 1 } else { finish(false) }
                }
                .buttonStyle(CapsulePrimaryButton())
                .keyboardShortcut(.defaultAction)
            }
        }
        .frame(height: 40)
    }
}

// MARK: Steps

private struct StepTitle: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 34, weight: .bold))
                .tracking(-0.9)
                .foregroundStyle(Plex.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(subtitle)
                .font(.system(size: 15))
                .foregroundStyle(Plex.ink2.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct FinePrint: View {
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 7) {
            Image(systemName: "lock.fill")
            Text(text).fixedSize(horizontal: false, vertical: true)
        }
        .font(.system(size: 12))
        .foregroundStyle(Plex.faint)
    }
}

/// A white card on the canvas, a little lifted (Slice's card).
private struct LiftedCard: ViewModifier {
    var highlighted = false

    func body(content: Content) -> some View {
        content
            .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(highlighted ? Plex.green300 : Plex.line, lineWidth: highlighted ? 1 : 0.5))
            .shadow(color: Plex.steel900.opacity(0.07), radius: 14, y: 5)
    }
}

private extension View {
    func lifted(highlighted: Bool = false) -> some View { modifier(LiftedCard(highlighted: highlighted)) }
}

private struct WelcomeStep: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            HStack(alignment: .top, spacing: 20) {
                StepTitle(title: "Your money and errands, handled",
                          subtitle: "Plex pays bills, watches subscriptions, splits receipts and runs the routines you describe, right from the notch.")
                    .frame(maxWidth: 430, alignment: .leading)
                Spacer(minLength: 0)
                hero
            }
            HStack(alignment: .top, spacing: 16) {
                VStack(spacing: 10) {
                    TalkKeys(keySize: 44)
                        .frame(height: 128)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    Text("Hold **fn** and **control** to talk, or hover the notch and type.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Plex.muted)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .frame(width: 280)
                .lifted()
                VStack(alignment: .leading, spacing: 16) {
                    Point(icon: "plex-money-receipt", title: "Nothing moves without a receipt",
                          text: "Every payment keeps your words and the rule that allowed it.")
                    Point(icon: "plex-mint-shield", title: "Your limits, enforced",
                          text: "Over a limit, Plex asks first. Allow, deny, or always.")
                    Point(icon: "plex-mint-cursor", title: "It hands you the wheel",
                          text: "Signing in is yours. Plex never types your passwords.")
                }
                .padding(.top, 4)
            }
        }
    }

    /// Three glossy icons floating over the aurora.
    private var hero: some View {
        ZStack {
            GlossyIcon("plex-money-card", floating: true, phase: 1.4)
                .frame(width: 70)
                .rotationEffect(.degrees(-12))
                .offset(x: -64, y: 34)
            GlossyIcon("plex-mint-orb", floating: true, phase: 2.6)
                .frame(width: 44)
                .offset(x: 70, y: -30)
            GlossyIcon("plex-money-receipt", floating: true)
                .frame(width: 104)
                .shadow(color: Plex.green700.opacity(0.18), radius: 16, y: 10)
        }
        .frame(width: 200, height: 140)
    }

    private struct Point: View {
        let icon: String
        let title: String
        let text: String

        var body: some View {
            HStack(alignment: .center, spacing: 14) {
                GlossyTile(image: icon, size: 46)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(Plex.ink)
                    Text(text).font(.system(size: 12.5)).foregroundStyle(Plex.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

/// The three permissions the notch needs: to hear you, the talk keys and acting in apps, and
/// seeing the screen when a task needs it.
private struct AccessStep: View {
    @State private var statuses: [Permissions.Kind: Permissions.Status] = [:]
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let kinds: [(Permissions.Kind, String)] = [
        (.microphone, "plex-mint-mic"), (.accessibility, "plex-mint-cursor"), (.screenRecording, "plex-mint-screen"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            HStack(alignment: .top, spacing: 20) {
                StepTitle(title: "Let Plex help",
                          subtitle: "Allow what it needs. macOS asks once for each, and you can change them later in Connections.")
                    .frame(maxWidth: 440, alignment: .leading)
                Spacer(minLength: 0)
                ZStack {
                    GlossyIcon("plex-mint-mic", floating: true, phase: 1.1)
                        .frame(width: 54)
                        .rotationEffect(.degrees(-10))
                        .offset(x: -62, y: 26)
                    GlossyIcon("plex-mint-shield", floating: true)
                        .frame(width: 100)
                        .shadow(color: Plex.green700.opacity(0.18), radius: 16, y: 10)
                }
                .frame(width: 190, height: 130)
            }
            HStack(alignment: .top, spacing: 14) {
                ForEach(kinds, id: \.0) { kind, icon in
                    PermissionCard(kind: kind, icon: icon, status: statuses[kind] ?? .notYet)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            FinePrint(text: "Plex only looks or acts when you ask, or when a routine you set up runs. It checks with you before money moves.")
            Spacer(minLength: 0)
        }
        .onAppear(perform: refresh)
        .onReceive(tick) { _ in refresh() }
    }

    private func refresh() {
        for (kind, _) in kinds {
            let now = Permissions.status(kind)
            if statuses[kind] != now { withAnimation(.snappy) { statuses[kind] = now } }
        }
    }
}

private struct PermissionCard: View {
    let kind: Permissions.Kind
    let icon: String
    let status: Permissions.Status

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                GlossyTile(image: icon, size: 52)
                Spacer(minLength: 6)
                action
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(kind.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Plex.ink)
                Text(kind.reason).font(.system(size: 12.5)).foregroundStyle(Plex.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .lifted(highlighted: status == .granted)
    }

    @ViewBuilder
    private var action: some View {
        switch status {
        case .granted:
            Label("On", systemImage: "checkmark")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Plex.green700)
                .padding(.horizontal, 10)
                .frame(height: 26)
                .background(Capsule().fill(Plex.green50))
        case .denied:
            Button("Open Settings") { Permissions.openSettings(kind) }
                .buttonStyle(CapsuleSecondaryButton(compact: true))
        case .notYet, .onFirstUse:
            Button("Allow") { Permissions.request(kind) }
                .buttonStyle(CapsuleSecondaryButton(compact: true))
        }
    }
}

/// Bring in the cloud accounts Plex reads bills and plans from (Composio, through the brain).
private struct ConnectStep: View {
    struct App: Identifiable {
        let slug: String
        let name: String
        let blurb: String
        var id: String { slug }
    }

    static let apps: [App] = [
        .init(slug: "gmail", name: "Gmail", blurb: "Bills, receipts and invoices"),
        .init(slug: "googlecalendar", name: "Google Calendar", blurb: "Due dates and your plans"),
        .init(slug: "googledrive", name: "Google Drive", blurb: "Statements and saved receipts"),
        .init(slug: "googlesheets", name: "Google Sheets", blurb: "Budgets and trackers"),
        .init(slug: "slack", name: "Slack", blurb: "Split requests and reminders"),
        .init(slug: "notion", name: "Notion", blurb: "Notes, plans and trackers"),
    ]

    @State private var connected: Set<String> = []
    @State private var pending: Set<String> = []
    @State private var problem: String?
    @Environment(\.stillRender) private var still

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .top) {
                StepTitle(title: "Bring in your accounts",
                          subtitle: "Connect a few now, so Plex can find bills and plan around your week. The rest are in Connections.")
                    .frame(maxWidth: 520, alignment: .leading)
                Spacer(minLength: 0)
                if !connected.isEmpty {
                    Label("\(connected.count) connected", systemImage: "checkmark")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(Plex.green700)
                        .padding(.horizontal, 12)
                        .frame(height: 28)
                        .background(Capsule().fill(.white.opacity(0.7)))
                        .transition(.scale.combined(with: .opacity))
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
                ForEach(Self.apps) { app in card(app) }
            }
            Spacer(minLength: 0)
            if let problem {
                Label(problem, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Plex.disputed)
                    .lineLimit(2)
            } else {
                FinePrint(text: "Sign-ins run through each service, so Plex never sees your passwords.")
            }
        }
        .animation(.snappy, value: connected)
        .task {
            if still { connected = ["gmail"]; return }
            while !Task.isCancelled {
                await refresh()
                try? await Task.sleep(for: .seconds(pending.isEmpty ? 8 : 2.5))
            }
        }
    }

    private func card(_ app: App) -> some View {
        let on = connected.contains(app.slug)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                GlossyTile(image: "logo-\(app.slug)", size: 46, logo: true)
                Spacer(minLength: 6)
                if on {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Plex.green600)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(Plex.green50))
                } else if pending.contains(app.slug) {
                    ProgressView().controlSize(.small).frame(height: 28)
                } else {
                    Button("Connect") { Task { await connect(app) } }
                        .buttonStyle(CapsuleSecondaryButton(compact: true))
                }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(app.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Plex.ink)
                Text(app.blurb).font(.system(size: 12.5)).foregroundStyle(Plex.muted).lineLimit(1)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .lifted(highlighted: on)
    }

    private func connect(_ app: App) async {
        pending.insert(app.slug)
        problem = nil
        do {
            let url = try await BrainAPI.connect(user: BrainAPI.userID, app: app.slug)
            NSWorkspace.shared.open(url)
        } catch {
            pending.remove(app.slug)
            problem = (error as? LocalizedError)?.errorDescription ?? "Plex's brain isn't answering. Connect later in Connections."
        }
    }

    private func refresh() async {
        guard let json = try? await BrainAPI.accounts(user: BrainAPI.userID) else { return }
        let on = Set((json["apps"]?.array ?? []).compactMap { app -> String? in
            app["state"]?.string == "connected" ? app["slug"]?.string : nil
        })
        connected = on
        pending.subtract(on)
    }
}

#if DEBUG
extension OnboardingView {
    /// -renderOnboarding <dir>: each step as a PNG.
    static func render(agent: AgentSession, to dir: URL) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for step in 0..<3 {
            UserDefaults.standard.set(step, forKey: OnboardingWindow.stepKey)
            let view = OnboardingView(agent: agent, finish: { _ in })
                .environment(\.stillRender, true)
                .environment(\.colorScheme, .light)
                .padding(30)
                .background(Color(white: 0.86))
            let renderer = ImageRenderer(content: view)
            renderer.scale = 2
            if let image = renderer.nsImage, let tiff = image.tiffRepresentation,
               let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
                try? png.write(to: dir.appendingPathComponent("onboarding-\(step + 1).png"))
            }
        }
        UserDefaults.standard.removeObject(forKey: OnboardingWindow.stepKey)
    }
}
#endif
