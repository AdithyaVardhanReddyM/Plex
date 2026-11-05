import SwiftUI

@main
struct PlexApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        MenuBarExtra {
            MenuBarMenu(agent: delegate.agent)
        } label: {
            Image(nsImage: MenuBarIcon.image)
        }
    }
}

private struct MenuBarMenu: View {
    let agent: AgentSession

    var body: some View {
        Text(status)
            .onAppear { Task { await agent.refreshAsks() } }
        Divider()
        Button("Open Plex") { MainWindowController.shared.show(agent: agent) }
            .keyboardShortcut("o")
        if agent.asksCount > 0 {
            Button("Needs you (\(agent.asksCount))") { MainWindowController.shared.show(agent: agent, section: .needsYou) }
        }
        Button("New conversation") { agent.reset() }
        Divider()
        Toggle("Pause all agent spending", isOn: Binding(get: { agent.paused }, set: { agent.setPaused($0) }))
        Divider()
        Button("Settings…") { MainWindowController.shared.show(agent: agent, section: .settings) }
            .keyboardShortcut(",")
        Divider()
        Button("Quit Plex") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }

    private var status: String {
        if agent.paused { return "Spending is paused" }
        if agent.connection == .online, agent.asksCount > 0 {
            return "\(agent.asksCount) waiting for you"
        }
        return agent.connection.label
    }
}
