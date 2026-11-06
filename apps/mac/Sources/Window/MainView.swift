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
            Text("Plex")
                .font(.system(size: 20, weight: .bold))
                .tracking(-0.5)
                .foregroundStyle(Plex.ink)
                .padding(.horizontal, 22)
                .padding(.top, 2)
                .padding(.bottom, 14)

            UserCard(model: model, agent: agent)
                .padding(.horizontal, 14)
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
        .background(alignment: .top) {
            MWAurora(base: Color(hex: 0xF2F6F4))
                .frame(height: 340)
                .ignoresSafeArea()
        }
        .background(Color(hex: 0xF2F6F4).ignoresSafeArea())
    }
}

/// Who Plex works for, and whether it's ready: an avatar, a greeting, the brain's status.
private struct UserCard: View {
    let model: MainWindowModel
    let agent: AgentSession

    private var name: String {
        let full = model.viewer.value?.name ?? ""
        return full.isEmpty ? BrainSettings.userName : full
    }

    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap(\.first).map(String.init).joined()
        return letters.isEmpty ? "P" : letters.uppercased()
    }

    var body: some View {
        HStack(spacing: 11) {
            Circle()
                .fill(MWLook.mintSteel)
                .overlay(
                    Text(initials)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .shadow(color: Plex.steel700.opacity(0.35), radius: 2, y: 1)
                )
                .overlay(Circle().strokeBorder(.white, lineWidth: 2))
                .frame(width: 40, height: 40)
                .shadow(color: MWLook.shadow, radius: 4, y: 2)
            VStack(alignment: .leading, spacing: 1) {
                Text("\(WindowFormat.greeting()),")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Plex.muted)
                Text(name.split(separator: " ").first.map(String.init) ?? name)
                    .font(.system(size: 15, weight: .bold))
                    .tracking(-0.2)
                    .foregroundStyle(Plex.ink)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    MWDot(color: brainColor, size: 6)
                    Text(brainText)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Plex.muted)
                        .lineLimit(1)
                }
                .padding(.top, 1)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Plex.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Plex.ink.opacity(0.05)))
        .shadow(color: MWLook.shadow, radius: 12, y: 4)
    }

    private var brainColor: Color {
        if ConvexClient.shared.reachable == false { return Plex.disputed }
        return switch agent.connection {
        case .online: Plex.green400
        case .connecting: Plex.steel400
        case .offline: Plex.faint
        }
    }

    private var brainText: String {
        if ConvexClient.shared.reachable == false { return "Can't reach Convex" }
        return switch agent.connection {
        case .online: "Plex is ready"
        case .connecting: "Connecting\u{2026}"
        case .offline: "Brain offline"
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
                MWGlossy(section.glossy, size: 22)
                    .saturation(selected ? 1 : 0.85)
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
                    .fill(selected ? Color(hex: 0xD9F5E8) : (hovering ? Plex.ink.opacity(0.04) : .clear))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .strokeBorder(selected ? Plex.green300.opacity(0.45) : .clear)
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
                        MWIcon(symbol: "pause.circle.fill", size: 13, color: Plex.refunded)
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
                        MWIcon(symbol: "pause.circle", size: 12, color: Plex.muted)
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
