import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let agent = AgentSession()
    private var island: IslandController?
    private let talkKeys = TalkKeyMonitor()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // The windows are light only; the island stays black (it sets its own appearance).
        NSApp.appearance = NSAppearance(named: .aqua)
        // Find agent-desktop and agent-browser once, off the main thread.
        Task.detached(priority: .utility) { CLITool.resolve() }

        island = IslandController(agent: agent)
        IslandActions.openMainWindow = { [agent] place in
            MainWindowController.shared.show(agent: agent, section: Self.section(place))
        }
        OnboardingWindow.shared.openConnections = { [agent] in
            MainWindowController.shared.show(agent: agent, section: .connections)
        }

        talkKeys.onPress = { [agent] in agent.startTalking() }
        talkKeys.onRelease = { [agent] in agent.stopTalking() }
        talkKeys.onCancel = { [agent] in agent.cancelTalking() }
        talkKeys.start()

        let defaults = UserDefaults.standard
        #if DEBUG
        // Drawing for a check: no brain connection, so the samples stay on screen.
        let rendering = defaults.string(forKey: "renderIsland") != nil || defaults.string(forKey: "renderWindow") != nil
            || defaults.string(forKey: "renderOnboarding") != nil
        #else
        let rendering = false
        #endif
        if !rendering { agent.connect() }

        #if DEBUG
        // Launch arguments for working on the island without touching it:
        //   -islandPreview open|captioned|compact|pill|receipt|drop   pin a mode, with a sample conversation
        //   -ask "…"                                                   type this once the brain is connected
        //   -sampleTasks YES                                           a money approval and a running task
        //   -sampleViews approval|takeover|question|receipt|routine|drop|note|file   one card
        if defaults.bool(forKey: "sampleTasks") {
            agent.loadSampleTasks()
        }
        if let type = defaults.string(forKey: "sampleViews") {
            agent.loadSampleView(type)
        }
        if let mode = defaults.string(forKey: "islandPreview").flatMap(IslandModel.Mode.init(rawValue:)) {
            agent.loadSampleConversation()
            island?.model.preview = mode
        }
        //   -renderIsland /some/dir                   every island mode and card as PNGs, then quit
        if let dir = defaults.string(forKey: "renderIsland") {
            if agent.turns.isEmpty { agent.loadSampleConversation() }
            if agent.tasks.isEmpty { agent.loadSampleTasks() }
            Task { @MainActor in
                await self.agent.prepareForRender()
                try? await Task.sleep(for: .milliseconds(500))
                self.island?.renderPreviews(to: URL(fileURLWithPath: dir))
                OnboardingView.render(agent: self.agent, to: URL(fileURLWithPath: dir))
                NSApp.terminate(nil)
            }
            return
        }
        //   -renderOnboarding /some/dir               the three onboarding steps as PNGs, then quit
        if let dir = defaults.string(forKey: "renderOnboarding") {
            OnboardingView.render(agent: agent, to: URL(fileURLWithPath: dir))
            NSApp.terminate(nil)
            return
        }
        //   -renderWindow /some/dir                   each main window section as PNGs, then quit
        if let dir = defaults.string(forKey: "renderWindow") {
            Task { @MainActor in
                await MainWindowRender.write(agent: self.agent, to: URL(fileURLWithPath: dir))
                NSApp.terminate(nil)
            }
            return
        }
        if let question = defaults.string(forKey: "ask") {
            agent.ask(question, whenOnline: true)
        }
        //   -previewOperator /some/dir                the operator overlay (glow, cursor, pill) as PNGs, then quit
        if let dir = defaults.string(forKey: "previewOperator") {
            Task { @MainActor in
                await AgentCursor.shared.preview(to: URL(fileURLWithPath: dir))
                NSApp.terminate(nil)
            }
            return
        }
        #endif

        // First run: three short steps. A setup macOS interrupted (it quits the app for some
        // permissions) carries on at the same step. Later, a talk permission that was turned off
        // opens Connections, which shows what's missing.
        if !OnboardingWindow.isDone || defaults.bool(forKey: "onboarding") {
            OnboardingWindow.shared.show(agent: agent)
        } else if !Permissions.allGranted {
            MainWindowController.shared.show(agent: agent, section: .connections)
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // Clicking the Dock icon (while the main window gave the app one) brings the window back.
        if !flag { MainWindowController.shared.show(agent: agent) }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        talkKeys.stop()
    }

    private static func section(_ place: WindowPlace) -> MainSection {
        switch place {
        case .today: .today
        case .needsYou: .needsYou
        case .connections: .connections
        case .settings: .settings
        }
    }
}
