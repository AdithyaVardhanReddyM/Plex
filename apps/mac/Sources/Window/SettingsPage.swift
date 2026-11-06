import AppKit
import SwiftUI

/// Settings: the spending kill switch, where the brain and Convex are, Plex's voice, and the talk keys.
struct SettingsPage: View {
    @Bindable var model: MainWindowModel
    let agent: AgentSession

    @State private var brainURL = BrainSettings.urlString
    @State private var convexURL = ConvexClient.shared.urlString
    @AppStorage("voiceName") private var voice = "Aoede"
    @State private var brainHealth: String?
    @State private var saved: String?

    static let voices = ["Aoede", "Kore", "Leda", "Zephyr", "Puck", "Charon", "Fenrir", "Orus"]

    var body: some View {
        MWPage(maxWidth: 760) {
            MWPageHeader(title: "Settings", glossy: "plex-mint-gear")

            group("Spending") {
                row(symbol: model.paused ? "pause.circle.fill" : "pause.circle", title: "Pause all agent spending",
                    note: model.paused ? "Every payment is blocked until you turn this off, whatever the pot's rules say."
                        : "Blocks every payment by every agent at once. Pots and routines keep their settings.") {
                    MWSwitch(isOn: Binding(get: { model.paused }, set: { on in Task { await model.setPaused(on) } }))
                        .disabled(model.viewer.value == nil)
                }
            }

            group("Addresses") {
                VStack(alignment: .leading, spacing: 10) {
                    fieldRow(symbol: "server.rack", title: "Brain", note: brainNote, text: $brainURL, placeholder: BrainSettings.localURL) {
                        BrainSettings.urlString = brainURL.trimmingCharacters(in: .whitespacesAndNewlines)
                        agent.reconnect()
                        saved = "brain"
                        Task { await checkBrain() }
                    }
                    MWDivider(inset: 30)
                    fieldRow(symbol: "cylinder.split.1x2", title: "Convex", note: convexNote, text: $convexURL, placeholder: ConvexClient.defaultURL) {
                        ConvexClient.shared.urlString = convexURL
                        saved = "convex"
                    }
                }
                .padding(.vertical, 4)
            }

            group("Voice") {
                row(symbol: "waveform", title: "Plex's voice", note: "The voice Plex answers in when you talk to it.") {
                    Picker("", selection: $voice) {
                        ForEach(Self.voices, id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden()
                    .fixedSize()
                }
                MWDivider(inset: 44)
                row(symbol: "keyboard", title: "Talk", note: "Hold the keys and speak. Let go and Plex answers. Hover the notch to type instead.") {
                    HStack(spacing: 4) {
                        SettingsKeyCap(text: "fn")
                        Text("+").font(.system(size: 12)).foregroundStyle(Plex.faint)
                        SettingsKeyCap(text: "control")
                    }
                }
            }

            group("About") {
                row(symbol: "info.circle", title: "Plex for Mac", note: "Version \(version). Money moves through the PayPal sandbox, and every payment has a receipt.") {
                    EmptyView()
                }
            }
        }
        .task { await checkBrain() }
    }

    private var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1"
    }

    private var brainNote: String {
        if saved == "brain" { return "Saved. Reconnecting\u{2026}" }
        switch agent.connection {
        case .online: return brainHealth ?? "Connected."
        case .connecting: return "Connecting\u{2026}"
        case .offline: return "Not connected. Start it with pnpm --filter @plex/agent dev."
        }
    }

    private var convexNote: String {
        if saved == "convex" { return "Saved. The window reads from here now." }
        switch ConvexClient.shared.reachable {
        case true?: return "Connected. The window's data comes from here."
        case false?: return "Can't reach it. Is pnpm dev running?"
        case nil: return "Where the window reads pots, routines and receipts."
        }
    }

    private func checkBrain() async {
        guard let json = try? await BrainAPI.health() else { brainHealth = nil; return }
        let f = DocFields(json)
        var parts = ["Connected"]
        if let model = f.str("model") { parts.append(model) }
        if f.bool("convex") == false { parts.append("no Convex") }
        if f.bool("composio") == false { parts.append("no Composio key") }
        brainHealth = parts.joined(separator: " \u{00B7} ") + "."
    }

    // MARK: Layout

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Plex.muted)
                .padding(.leading, 2)
            VStack(alignment: .leading, spacing: 0) { content() }
                .padding(.horizontal, 14)
                .padding(.vertical, 4)
                .background(Plex.surface, in: RoundedRectangle(cornerRadius: Plex.radiusMD, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Plex.radiusMD, style: .continuous).strokeBorder(Plex.line))
        }
    }

    private func row<Control: View>(symbol: String, title: String, note: String, @ViewBuilder control: () -> Control) -> some View {
        HStack(spacing: 12) {
            MWIcon(symbol: symbol, size: 14, color: Plex.muted).frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(Plex.ink)
                Text(note)
                    .font(.system(size: 12))
                    .foregroundStyle(Plex.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 16)
            control()
        }
        .padding(.vertical, 10)
    }

    private func fieldRow(symbol: String, title: String, note: String, text: Binding<String>, placeholder: String, save: @escaping () -> Void) -> some View {
        HStack(alignment: .top, spacing: 12) {
            MWIcon(symbol: symbol, size: 14, color: Plex.muted).frame(width: 20).padding(.top, 7)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(Plex.ink)
                HStack(spacing: 8) {
                    MWTextField(placeholder: placeholder, text: text, monospaced: true, onSubmit: save)
                    Button("Save", action: save).mwButton(.secondary)
                }
                Text(note).font(.system(size: 12)).foregroundStyle(Plex.muted)
            }
        }
        .padding(.vertical, 8)
    }
}

private struct SettingsKeyCap: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 11.5, weight: .medium))
            .foregroundStyle(Plex.ink2)
            .padding(.horizontal, 8)
            .frame(height: 22)
            .background(Plex.surface, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(Plex.lineStrong))
            .shadow(color: Plex.ink.opacity(0.08), radius: 0, y: 1)
    }
}
