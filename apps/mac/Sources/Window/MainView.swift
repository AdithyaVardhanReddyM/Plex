import SwiftUI

/// The main window's root: a sidebar of sections and the page for the one picked.
struct MainView: View {
    @Bindable var model: MainWindowModel
    let agent: AgentSession

    var body: some View {
        NavigationSplitView {
            MainSidebar(model: model, agent: agent)
                .toolbar(removing: .sidebarToggle)
                .navigationSplitViewColumnWidth(min: 236, ideal: 244, max: 280)
        } detail: {
            detail
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Plex.canvas)
        }
        .environment(\.colorScheme, .light)
        .tint(Plex.ink)
        .task { await model.pending.run() }
        .task { await model.viewer.run() }
        .task { await model.watchSettling() }
        .sheet(isPresented: $model.showingNewRoutine, onDismiss: {
            model.newRoutinePrompt = ""
            model.newRoutineDraft = nil
            model.editingRoutineID = nil
        }) {
            NewRoutineSheet(model: model, prompt: model.newRoutinePrompt, draft: model.newRoutineDraft, editingID: model.editingRoutineID)
        }
    }

    @ViewBuilder private var detail: some View {
        switch model.section {
        case .today: TodayPage(model: model)
        case .needsYou: NeedsYouPage(model: model)
        case .routines:
            if let id = model.openRoutineID {
                RoutineDetailPage(model: model, routineID: id).id(id)
            } else {
                RoutinesPage(model: model)
            }
        case .activity: ActivityPage()
        case .money: MoneyPage(model: model)
        case .insights: InsightsPage()
        case .memory: MemoryPage()
        case .connections: ConnectionsPage()
        case .settings: SettingsPage(model: model, agent: agent)
        }
    }
}

// MARK: Sidebar

struct MainSidebar: View {
    @Bindable var model: MainWindowModel
    let agent: AgentSession

    private let groups: [[MainSection]] = [
        [.today, .needsYou],
        [.routines, .activity, .money, .insights, .memory],
        [.connections, .settings],
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlexLogo(height: 24)
                .padding(.horizontal, 22)
                .padding(.top, 2)
                .padding(.bottom, 14)

            UserCard(model: model, agent: agent)
                .padding(.horizontal, 12)
                .padding(.bottom, 16)

            VStack(alignment: .leading, spacing: 12) {
                ForEach(groups.indices, id: \.self) { i in
                    VStack(spacing: 2) {
                        ForEach(groups[i]) { section in
                            SidebarRow(section: section, selected: model.section == section,
                                       badge: section == .needsYou ? model.needsYouCount : 0) {
                                model.go(section)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 12)

            Spacer(minLength: 12)

            SidebarFooter(model: model)
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        // A flat, quiet column: the colour lives in the pages, not the navigation.
        .background(MWLook.sidebar.ignoresSafeArea())
    }
}

/// Who Plex works for: their avatar (DiceBear "Dylan", as in Slice) and name. Opens Settings. The
/// brain's status shows here only when something is wrong.
private struct UserCard: View {
    let model: MainWindowModel
    let agent: AgentSession
    @State private var hovering = false

    private var name: String {
        let full = model.viewer.value?.name ?? ""
        return full.isEmpty ? BrainSettings.userName : full
    }

    var body: some View {
        Button { model.go(.settings) } label: {
            HStack(spacing: 10) {
                Image("avatar-user")
                    .resizable()
                    .interpolation(.high)
                    .frame(width: 34, height: 34)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(Plex.ink.opacity(0.08)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(.system(size: 13.5, weight: .semibold))
                        .tracking(-0.1)
                        .foregroundStyle(Plex.ink)
                        .lineLimit(1)
                    if let problem {
                        HStack(spacing: 5) {
                            MWDot(color: problem.color, size: 6)
                            Text(problem.text)
                                .font(.system(size: 11.5))
                                .foregroundStyle(Plex.muted)
                                .lineLimit(1)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Plex.surface.opacity(hovering ? 1 : 0.7))
            )
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Plex.ink.opacity(0.06)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help("Settings")
    }

    /// Nothing when Plex is fine; a line when Convex or the brain can't be reached.
    private var problem: (text: String, color: Color)? {
        if ConvexClient.shared.reachable == false { return ("Can't reach Convex", Plex.disputed) }
        return switch agent.connection {
        case .online: nil
        case .connecting: ("Connecting\u{2026}", Plex.steel400)
        case .offline: ("Brain offline", Plex.faint)
        }
    }
}

private struct SidebarRow: View {
    let section: MainSection
    let selected: Bool
    var badge = 0
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                MWIcon(symbol: section.icon, size: 15, color: selected ? Plex.green800 : Plex.muted)
                    .frame(width: 20)
                Text(section.title)
                    .font(.system(size: 14, weight: selected ? .semibold : .medium))
                    .foregroundStyle(selected ? Plex.ink : Plex.ink2)
                Spacer(minLength: 4)
                if badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 11, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(LinearGradient(colors: [Plex.steel400, Plex.steel600], startPoint: .top, endPoint: .bottom), in: Capsule())
                }
            }
            .padding(.horizontal, 10)
            .frame(height: 36)
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(selected ? Plex.surface : (hovering ? Plex.ink.opacity(0.04) : .clear))
                    .shadow(color: selected ? MWLook.shadow : .clear, radius: 3, y: 1)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .strokeBorder(selected ? Plex.ink.opacity(0.06) : .clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

private struct SidebarFooter: View {
    @Bindable var model: MainWindowModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if model.paused {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 7) {
                        MWIcon(symbol: "circle-pause", size: 13, color: Plex.refunded)
                        Text("Spending paused")
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundStyle(Plex.refunded)
                    }
                    Text("Every payment is blocked until you resume.")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Plex.refunded.opacity(0.85))
                        .lineLimit(2)
                    Button("Resume spending") { Task { await model.setPaused(false) } }
                        .mwButton(.secondary, size: .small)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Plex.refundedBg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Plex.refunded.opacity(0.15)))
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    TalkKeys(pressed: MWLook.still ? true : nil, keySize: 30)
                        .frame(height: 74)
                    Text("Hold fn + control to talk, or hover over the notch to type.")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Plex.muted)
                        .lineSpacing(1.5)
                        .lineLimit(3)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 10)
                }
                .background(Plex.surface.opacity(0.75), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Plex.ink.opacity(0.05)))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                Button { Task { await model.setPaused(true) } } label: {
                    HStack(spacing: 7) {
                        MWIcon(symbol: "circle-pause", size: 12, color: Plex.muted)
                        Text("Pause all spending").font(.system(size: 12, weight: .medium)).foregroundStyle(Plex.muted)
                    }
                    .padding(.horizontal, 8)
                    .frame(height: 22)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Block every agent payment until you resume")
            }
        }
    }
}
