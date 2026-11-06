import AppKit
import Contacts
import EventKit
import SwiftUI

/// Connections: the apps Plex reads and acts in (Composio through the brain, and the Mac's own apps),
/// what macOS lets it do, and the computer-use tools on this Mac.
struct ConnectionsPage: View {
    @State private var model = ConnectionsModel()

    var body: some View {
        MWPage(maxWidth: 960) {
            MWPageHeader(title: "Connections",
                         icon: "plug",
                         subtitle: "The apps Plex can read and act in, what macOS lets it do, and the tools it uses to work on your screen. It asks before it sends or changes anything.")
            apps
            permissions
            tools
            PlexLabel("Sign-ins run through Composio, so Plex never sees your passwords or tokens. Disconnect an app at any time.", icon: "lock")
                .font(.system(size: 12))
                .foregroundStyle(Plex.faint)
        }
        .task { await model.run() }
    }

    // MARK: Apps

    private var apps: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle(title: "Apps", icon: "layout-grid") {
                let on = model.apps.filter(\.isOn).count
                if model.loaded, on > 0 {
                    HStack(spacing: 5) {
                        PlexIcon(symbol: "check", size: 10.5, color: nil)
                        Text("\(on) connected").font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundStyle(Plex.green700)
                    .padding(.horizontal, 10)
                    .frame(height: 26)
                    .background(Plex.green50, in: Capsule())
                }
            }
            if let problem = model.problem {
                MWBanner(message: problem, symbol: "wifi-off", action: ("Try again", { Task { await model.load() } }))
            } else if model.loaded, !model.configured {
                MWBanner(message: "Composio isn't set up on the brain yet. Add \(model.keyName) to apps/agent/.env to connect cloud apps.",
                         symbol: "key", tone: .neutral)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 250), spacing: 14, alignment: .top)], spacing: 14) {
                ForEach(model.apps) { app in
                    AppCard(app: app, usable: app.onMac || (model.configured && model.problem == nil),
                            pending: model.pending[app.slug] != nil, busy: model.busy.contains(app.slug), note: model.notes[app.slug],
                            connect: { Task { await model.connect(app) } },
                            disconnect: { Task { await model.disconnect(app) } },
                            cancel: { model.pending[app.slug] = nil })
                }
            }
        }
    }

    // MARK: Permissions

    private var permissions: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle("This Mac", icon: "shield-check")
            MWListCard {
                ForEach(Array(Permissions.listed.enumerated()), id: \.offset) { i, kind in
                    if i > 0 { MWDivider(inset: 62) }
                    PermissionRow(kind: kind, status: model.permissions[i])
                }
            }
        }
    }

    // MARK: Tools

    private var tools: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle(title: "Computer use", icon: "mouse-pointer-2") {
                Text("Reads apps through accessibility, so it's fast and exact")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Plex.faint)
            }
            if let problem = model.toolsProblem {
                MWBanner(message: problem, symbol: "wifi-off", tone: .neutral)
            }
            MWListCard {
                ToolRow(name: "agent-desktop", blurb: "Reads and works native Mac apps through the accessibility tree.",
                        symbol: "monitor", status: model.desktop)
                MWDivider(inset: 62)
                ToolRow(name: "agent-browser", blurb: "Drives Plex's own Chrome profile, where you stay signed in.",
                        symbol: "layout-grid", status: model.browser)
            }
        }
    }
}

// MARK: Model

struct ConnectionApp: Identifiable, Equatable {
    enum Status: Equatable { case connected, expired, available, allowed, notAsked, denied }

    let slug: String
    let name: String
    let group: String
    let blurb: String
    let onMac: Bool
    var status: Status

    var id: String { slug }
    var isOn: Bool { status == .connected || status == .allowed }
}

struct ToolStatus: Equatable {
    var installed: Bool
    var version: String?
    var accessibility: Bool?
}

@MainActor
@Observable
final class ConnectionsModel {
    struct Pending { let since: Date }

    var apps: [ConnectionApp] = ConnectionsModel.catalog
    var configured = true
    var keyName = "COMPOSIO_MAC_API_KEY"
    var loaded = false
    var problem: String?
    var pending: [String: Pending] = [:]
    var busy: Set<String> = []
    var notes: [String: String] = [:]
    var permissions: [Permissions.Status] = Permissions.listed.map { _ in .notYet }
    var desktop: ToolStatus?
    var browser: ToolStatus?
    var toolsProblem: String?

    /// The brain's catalog (accounts.py), so the page has its shape before the brain answers.
    static let catalog: [ConnectionApp] = [
        .init(slug: "gmail", name: "Gmail", group: "money", blurb: "Bills, receipts and invoices in your mail", onMac: false, status: .available),
        .init(slug: "slack", name: "Slack", group: "money", blurb: "Channels, threads and messages", onMac: false, status: .available),
        .init(slug: "googlecalendar", name: "Google Calendar", group: "plans", blurb: "Your events and due dates", onMac: false, status: .available),
        .init(slug: "calendar", name: "Calendar", group: "plans", blurb: "Every calendar on this Mac", onMac: true, status: .notAsked),
        .init(slug: "reminders", name: "Reminders", group: "plans", blurb: "Your to-dos and lists on this Mac", onMac: true, status: .notAsked),
        .init(slug: "contacts", name: "Contacts", group: "plans", blurb: "The people you pay and split with", onMac: true, status: .notAsked),
        .init(slug: "googlesheets", name: "Google Sheets", group: "files", blurb: "Budgets and trackers", onMac: false, status: .available),
        .init(slug: "googledrive", name: "Google Drive", group: "files", blurb: "Find any file in your Drive", onMac: false, status: .available),
        .init(slug: "notion", name: "Notion", group: "files", blurb: "Pages and databases", onMac: false, status: .available),
    ]

    func run() async {
        await load()
        await loadTools()
        var ticks = 0
        while !Task.isCancelled {
            refreshMac()
            try? await Task.sleep(for: .seconds(2.5))
            ticks += 1
            let now = Date()
            pending = pending.filter { now.timeIntervalSince($0.value.since) < 300 }
            if !pending.isEmpty || ticks % 12 == 0 { await load() }
            if ticks % 12 == 0 { await loadTools() }
        }
    }

    func load() async {
        do {
            apply(try await BrainAPI.accounts(user: BrainAPI.userID))
            problem = nil
        } catch {
            problem = (error as? LocalizedError)?.errorDescription ?? "Can't reach Plex's brain."
        }
        loaded = true
        refreshMac()
    }

    private func apply(_ json: JSONValue) {
        let f = DocFields(json)
        configured = f.bool("configured") ?? false
        keyName = f.str("key") ?? keyName
        let known = Dictionary(apps.map { ($0.slug, $0.status) }, uniquingKeysWith: { a, _ in a })
        let fresh: [ConnectionApp] = f.list("apps").compactMap { item in
            let a = DocFields(item)
            guard let slug = a.str("slug") else { return nil }
            let onMac = a.bool("on_mac") ?? false
            let status: ConnectionApp.Status = onMac ? (known[slug] ?? .notAsked) : {
                switch a.str("state") {
                case "connected": return .connected
                case "expired": return .expired
                default: return .available
                }
            }()
            return ConnectionApp(slug: slug, name: a.str("name") ?? slug, group: a.str("group") ?? "", blurb: a.str("blurb") ?? "",
                                 onMac: onMac, status: status)
        }
        if !fresh.isEmpty { apps = fresh }
        for app in apps where app.status == .connected { pending[app.slug] = nil }
    }

    func loadTools() async {
        do {
            let f = DocFields(try await BrainAPI.toolsStatus())
            let d = f.sub("agentDesktop"), b = f.sub("agentBrowser")
            // `accessibility` comes as a bool or as "granted" / "denied"; versions may carry the tool's name.
            func version(_ f: DocFields) -> String? {
                f.str("version").map { $0.replacingOccurrences(of: "agent-browser ", with: "").replacingOccurrences(of: "agent-desktop ", with: "") }
            }
            desktop = ToolStatus(installed: d.bool("installed") ?? false, version: version(d),
                                 accessibility: d.bool("accessibility") ?? d.str("accessibility").map { $0 == "granted" })
            browser = ToolStatus(installed: b.bool("installed") ?? false, version: version(b), accessibility: nil)
            toolsProblem = nil
        } catch {
            toolsProblem = "The brain checks these tools on this Mac. \((error as? LocalizedError)?.errorDescription ?? "")"
        }
    }

    /// macOS's answers for the apps on this Mac and the privacy permissions.
    func refreshMac() {
        permissions = Permissions.listed.map { Permissions.status($0) }
        let statuses: [String: ConnectionApp.Status] = [
            "calendar": Self.eventStatus(EKEventStore.authorizationStatus(for: .event)),
            "reminders": Self.eventStatus(EKEventStore.authorizationStatus(for: .reminder)),
            "contacts": {
                switch CNContactStore.authorizationStatus(for: .contacts) {
                case .authorized: return .allowed
                case .notDetermined: return .notAsked
                default: return .denied
                }
            }(),
        ]
        for (slug, status) in statuses {
            if let i = apps.firstIndex(where: { $0.slug == slug }), apps[i].status != status { apps[i].status = status }
        }
    }

    private static func eventStatus(_ status: EKAuthorizationStatus) -> ConnectionApp.Status {
        switch status {
        case .fullAccess: .allowed
        case .notDetermined: .notAsked
        default: .denied
        }
    }

    func connect(_ app: ConnectionApp) async {
        notes[app.slug] = nil
        if app.onMac {
            await allow(app)
            return
        }
        pending[app.slug] = Pending(since: Date())
        do {
            let url = try await BrainAPI.connect(user: BrainAPI.userID, app: app.slug)
            NSWorkspace.shared.open(url)
        } catch {
            pending[app.slug] = nil
            notes[app.slug] = (error as? LocalizedError)?.errorDescription
        }
    }

    func disconnect(_ app: ConnectionApp) async {
        if app.onMac {
            openPrivacy(app)
            return
        }
        busy.insert(app.slug)
        defer { busy.remove(app.slug) }
        do {
            apply(try await BrainAPI.disconnect(user: BrainAPI.userID, app: app.slug))
        } catch {
            notes[app.slug] = (error as? LocalizedError)?.errorDescription
        }
    }

    private func allow(_ app: ConnectionApp) async {
        if app.status == .denied || app.status == .allowed {
            openPrivacy(app)
            return
        }
        switch app.slug {
        case "calendar": _ = try? await EKEventStore().requestFullAccessToEvents()
        case "reminders": _ = try? await EKEventStore().requestFullAccessToReminders()
        case "contacts": _ = try? await CNContactStore().requestAccess(for: .contacts)
        default: openPrivacy(app)
        }
        refreshMac()
    }

    func openPrivacy(_ app: ConnectionApp) {
        let anchor = switch app.slug {
        case "reminders": "Privacy_Reminders"
        case "calendar": "Privacy_Calendars"
        case "contacts": "Privacy_Contacts"
        default: "Privacy_Automation"
        }
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(anchor)") { NSWorkspace.shared.open(url) }
    }
}

// MARK: Pieces

private struct AppCard: View {
    let app: ConnectionApp
    let usable: Bool
    let pending: Bool
    let busy: Bool
    let note: String?
    let connect: () -> Void
    let disconnect: () -> Void
    let cancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                AppMark(app: app)
                Spacer(minLength: 8)
                action
            }
            .padding(.bottom, 12)
            HStack(spacing: 6) {
                Text(app.name)
                    .font(.system(size: 15, weight: .bold))
                    .tracking(-0.2)
                    .foregroundStyle(Plex.ink)
                    .lineLimit(1)
                status
            }
            .frame(height: 20)
            Text(note ?? (pending ? "Finish signing in, in your browser" : app.blurb))
                .font(.system(size: 12.5))
                .foregroundStyle(note != nil ? Plex.disputed : (pending ? Plex.steel600 : Plex.muted))
                .lineLimit(2, reservesSpace: true)
                .padding(.top, 2)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Plex.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Plex.ink.opacity(0.06)))
        .shadow(color: MWLook.shadow, radius: 14, y: 5)
    }

    @ViewBuilder private var status: some View {
        switch app.status {
        case .connected, .allowed:
            PlexIcon(symbol: "circle-check", size: 13, color: nil)
                .foregroundStyle(Plex.green500)
                .help(app.status == .connected ? "Connected" : "Allowed")
        case .expired: MWBadge(text: "Sign in again", tone: .amber)
        case .denied: MWBadge(text: "Turned off", tone: .amber)
        case .available, .notAsked: EmptyView()
        }
    }

    @ViewBuilder private var action: some View {
        if pending {
            HStack(spacing: 6) {
                ProgressView().controlSize(.mini)
                Button("Cancel", action: cancel).mwButton(.secondary, size: .small)
            }
        } else if busy {
            ProgressView().controlSize(.small)
        } else {
            switch app.status {
            case .connected:
                Button("Disconnect", action: disconnect).mwButton(.ghost, size: .small)
            case .allowed:
                Button("Settings", action: disconnect).mwButton(.ghost, size: .small)
            case .denied:
                Button("Open Settings", action: connect).mwButton(.secondary, size: .small)
            case .expired, .available, .notAsked:
                Button(app.onMac ? "Allow" : "Connect", action: connect)
                    .mwButton(.secondary, size: .small)
                    .disabled(!usable)
            }
        }
    }
}

/// The app's real icon for the Mac's own apps; its logo on a white tile for cloud apps.
private struct AppMark: View {
    let app: ConnectionApp
    private let size: CGFloat = 46

    var body: some View {
        if app.onMac, let icon = Self.macIcon(app.name) {
            Image(nsImage: icon)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size * 1.2, height: size * 1.2)
                .frame(width: size, height: size)
                .shadow(color: MWLook.shadow, radius: 5, y: 2)
        } else {
            RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
                .fill(Plex.surface)
                .overlay(RoundedRectangle(cornerRadius: size * 0.27, style: .continuous).strokeBorder(Plex.ink.opacity(0.07), lineWidth: 0.5))
                .overlay {
                    if let logo = NSImage(named: "logo-\(app.slug)") {
                        Image(nsImage: logo).resizable().interpolation(.high).scaledToFit().padding(size * 0.2)
                    } else {
                        PlexIcon(symbol: Self.symbol(app.slug), size: 18, color: Plex.ink2)
                    }
                }
                .frame(width: size, height: size)
                .shadow(color: MWLook.shadow, radius: 7, y: 3)
        }
    }

    static func symbol(_ slug: String) -> String {
        switch slug {
        case "gmail": "mail"
        case "slack": "number"
        case "googlecalendar": "calendar"
        case "googlesheets": "sheet"
        case "googledrive": "hard-drive"
        case "googledocs": "file-text"
        case "notion": "file-text"
        default: "app"
        }
    }

    private static var cache: [String: NSImage] = [:]

    static func macIcon(_ name: String) -> NSImage? {
        if let icon = cache[name] { return icon }
        let path = "/System/Applications/\(name).app"
        guard FileManager.default.fileExists(atPath: path) else { return nil }
        let icon = NSWorkspace.shared.icon(forFile: path)
        cache[name] = icon
        return icon
    }
}

private struct PermissionRow: View {
    let kind: Permissions.Kind
    let status: Permissions.Status

    var body: some View {
        HStack(spacing: 12) {
            PlexIconTile(symbol: icon, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(kind.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Plex.ink)
                    if kind.need == .needed, status != .granted {
                        MWBadge(text: "Needed", tone: .amber)
                    }
                }
                Text(kind.reason.replacingOccurrences(of: "Slice", with: "Plex"))
                    .font(.system(size: 12))
                    .foregroundStyle(Plex.muted)
                    .lineLimit(2)
            }
            Spacer(minLength: 12)
            switch status {
            case .granted:
                MWBadge(text: "Allowed", tone: .outline, symbol: "check")
            case .onFirstUse:
                Text("Asks when needed").font(.system(size: 12)).foregroundStyle(Plex.faint)
                Button("Allow now") { Permissions.request(kind) }.mwButton(.ghost, size: .small)
            case .denied:
                MWBadge(text: "Turned off", tone: .amber)
                Button("Open Settings") { Permissions.openSettings(kind) }.mwButton(.secondary, size: .small)
            case .notYet:
                Button(kind.isSwitchInSettings ? "Open Settings" : "Allow") {
                    if kind.isSwitchInSettings { Permissions.openSettings(kind) } else { Permissions.request(kind) }
                }
                .mwButton(.secondary, size: .small)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    /// Keyed on the Settings pane, which stays put when the list of kinds changes.
    private var icon: String {
        switch kind.settingsAnchor {
        case "Privacy_Microphone": "mic"
        case "Privacy_Accessibility": "mouse-pointer-2"
        case "Privacy_ScreenCapture": "monitor"
        case "Privacy_LocationServices": "map-pin"
        case "Privacy_Automation": "layout-grid"
        case "Privacy_AllFiles": "folder"
        default: "shield-check"
        }
    }
}

private struct ToolRow: View {
    let name: String
    let blurb: String
    let symbol: String
    let status: ToolStatus?

    var body: some View {
        HStack(spacing: 12) {
            PlexIconTile(symbol: symbol, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(name)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(Plex.ink)
                    if let version = status?.version {
                        Text(version)
                            .font(.system(size: 11.5, design: .monospaced))
                            .foregroundStyle(Plex.faint)
                    }
                }
                Text(blurb)
                    .font(.system(size: 12))
                    .foregroundStyle(Plex.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 12)
            if let status {
                if status.installed {
                    if status.accessibility == false {
                        MWBadge(text: "Needs Accessibility", tone: .amber)
                    }
                    MWBadge(text: "Installed", tone: .outline, symbol: "check")
                } else {
                    MWBadge(text: "Not installed", tone: .amber)
                }
            } else {
                Text("Unknown").font(.system(size: 12)).foregroundStyle(Plex.faint)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }
}
