import SwiftUI

/// A routine as the user reads it: When → If → Then. Shared by the detail page and the New routine
/// review, so what you approve is exactly what you'll see later.
struct RoutineFlow: View {
    let spec: RoutineSpec
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            stage("When", icon: WindowFormat.triggerIcon(spec.trigger), last: false) {
                block {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(WindowFormat.trigger(spec.trigger))
                                .font(.system(size: 13.5, weight: .semibold))
                                .foregroundStyle(Plex.ink)
                            if let sub = triggerDetail {
                                Text(sub)
                                    .font(.system(size: 11.5, design: .monospaced))
                                    .foregroundStyle(Plex.muted)
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            if !spec.conditions.isEmpty {
                stage("If", icon: "shield-check", last: false) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(spec.conditions.indices, id: \.self) { i in
                            block {
                                HStack(spacing: 10) {
                                    MWIcon(symbol: "circle-check", size: 13, color: Plex.ink2)
                                        .frame(width: 18)
                                    Text(spec.conditions[i].text)
                                        .font(.system(size: 13))
                                        .foregroundStyle(Plex.ink)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Spacer(minLength: 0)
                                }
                            }
                        }
                    }
                }
            }
            stage("Then", icon: spec.movesMoney ? "hand" : "mouse-pointer-2", last: true) {
                VStack(alignment: .leading, spacing: 6) {
                    if spec.steps.isEmpty {
                        block {
                            Text("No steps yet.").font(.system(size: 13)).foregroundStyle(Plex.muted)
                        }
                    }
                    ForEach(Array(spec.steps.enumerated()), id: \.offset) { i, step in
                        StepBlock(index: i + 1, step: step, guardrails: step.kind == .money ? spec.guardrails : nil)
                    }
                }
            }
        }
    }

    private var triggerDetail: String? {
        switch spec.trigger {
        case let .email(query, _): query.isEmpty ? nil : query
        case let .paypal(event, label): label.isEmpty ? nil : event
        case let .folder(path, pattern, _): pattern.map { "\(path) \u{00B7} \($0)" } ?? path
        default: nil
        }
    }

    /// A stage: a icon node and its label on the left rail, its blocks on the right, a gradient line down to the next.
    private func stage<Content: View>(_ label: String, icon: String, last: Bool, @ViewBuilder content: () -> Content) -> some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 3) {
                MWIconTile(symbol: icon, size: compact ? 34 : 38)
                Text(label)
                    .font(.system(size: 10.5, weight: .bold))
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(Plex.muted)
                if !last {
                    Capsule()
                        .fill(LinearGradient(colors: [Plex.green300, MWLook.aqua, Plex.steel300], startPoint: .top, endPoint: .bottom))
                        .frame(width: 2.5)
                        .frame(maxHeight: .infinity)
                        .padding(.top, 2)
                        .padding(.bottom, -14)
                }
            }
            .frame(width: 48)
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, compact ? 0 : 1)
                .padding(.bottom, last ? 0 : (compact ? 14 : 18))
        }
    }

    private func block<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(.horizontal, 12)
            .padding(.vertical, compact ? 10 : 11)
            .frame(minHeight: compact ? 34 : 38)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Plex.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Plex.ink.opacity(0.06)))
            .shadow(color: MWLook.shadow.opacity(0.7), radius: 8, y: 3)
    }
}

/// One numbered step. Money steps are steel (money held behind a rule) and carry their guardrail.
struct StepBlock: View {
    let index: Int
    let step: RoutineStep
    var guardrails: RoutineSpec.Guardrails?

    private var money: Bool { step.kind == .money }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Text("\(index)")
                    .font(.system(size: 11, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(money ? Plex.steel700 : Plex.ink2)
                    .frame(width: 20, height: 20)
                    .background(money ? Plex.steel100 : Plex.sunken, in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        MWIcon(symbol: WindowFormat.stepSymbol(step.kind), size: 11.5, color: money ? Plex.steel600 : Plex.muted)
                        Text(step.title)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Plex.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let detail = step.detail, !detail.isEmpty {
                        Text(detail)
                            .font(.system(size: 12))
                            .foregroundStyle(Plex.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, 1)
                Spacer(minLength: 0)
            }
            if let guardrails, let text = Self.guardrailText(guardrails) {
                HStack(spacing: 6) {
                    MWIcon(symbol: "shield-check", size: 11, color: Plex.steel600)
                    Text(text)
                        .font(.system(size: 12))
                        .foregroundStyle(Plex.steel700)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.leading, 30)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            if money {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(LinearGradient(colors: [Plex.steel100, Plex.steel50], startPoint: .topLeading, endPoint: .bottomTrailing))
            } else {
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Plex.surface)
            }
        }
        .overlay(alignment: .leading) {
            if money {
                // The foil edge: this step moves money, behind a rule.
                UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 14, style: .continuous)
                    .fill(Plex.metal)
                    .frame(width: 4)
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(money ? Plex.steel200 : Plex.ink.opacity(0.06)))
        .shadow(color: MWLook.shadow.opacity(0.7), radius: 8, y: 3)
    }

    /// "From the Food pot, up to $200. Asks you over the pot's limit."
    static func guardrailText(_ g: RoutineSpec.Guardrails) -> String? {
        var first: [String] = []
        if let pot = g.potName, !pot.isEmpty { first.append("From the \(pot) pot") }
        if let max = g.maxSpendCents { first.append("up to \(Money.format(max, whole: true))") }
        var line = first.joined(separator: ", ")
        if !line.isEmpty { line = line.prefix(1).uppercased() + line.dropFirst() + ". " }
        switch g.approval {
        case "always": line += "Asks you every time."
        case "never_money": line += "Never moves money on its own."
        default: line += "Asks you when it's over your limits."
        }
        return line
    }
}
