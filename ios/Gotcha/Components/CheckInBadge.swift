//
//  CheckInBadge.swift
//  Gotcha
//
//  The website's daily check-in UI (components/CheckInBadge.tsx). Deliberately still: no
//  animation, just shape and color. Before check-in things are drawn with dashed, open outlines
//  (exposed). Once checked in, the player's card is enclosed by a solid ring in the same calm
//  blue as the check by their name (covered for the day).
//

import SwiftUI

/// The "check in" button, shown until they've checked in today. Tapping it checks in
/// (by sharing their location). Once they have, it's replaced by the VerifiedCheck and card ring.
struct CheckInBadge: View {
    let settings: GameSettings
    let locating: Bool
    var hint: String?
    let onCheckIn: () -> Void

    var body: some View {
        VStack(spacing: 4) {
            Button(action: onCheckIn) {
                HStack(spacing: 8) {
                    // an open, dashed ring: the empty spot the check will fill
                    Circle()
                        .stroke(style: StrokeStyle(lineWidth: 1.5, dash: [2.25, 2.25]))
                        .frame(width: 13.5, height: 13.5)
                        .padding(1.25)
                    Text(locating
                         ? Copy.CheckIn.locating
                         : Copy.fill(Copy.CheckIn.prompt, [
                             "where": settings.checkInWhere,
                             "deadline": settings.checkInDeadlineText,
                         ]))
                        .font(.system(size: Theme.FontSize.small, weight: .medium))
                }
                .foregroundStyle(Theme.Colors.checkInText)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .overlay(
                    Capsule().strokeBorder(Theme.Colors.checkInBorder, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                )
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(locating)
            .opacity(locating ? 0.7 : 1)

            if let hint, !locating {
                Text(hint)
                    .font(.system(size: Theme.FontSize.caption))
                    .foregroundStyle(Theme.Colors.textMuted)
            }
        }
        .padding(.top, 4)
    }
}

/// The blue check next to a player's name once they've checked in today.
/// Tapping it shows what it means (phones can't hover).
struct VerifiedCheck: View {
    let tooltip: String
    var size: CGFloat = 20

    @State private var showingTooltip = false

    var body: some View {
        Button { showingTooltip.toggle() } label: {
            ScallopedCheck()
                .frame(width: size, height: size)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Copy.CheckIn.checkedIn)
        .accessibilityHint(tooltip)
        .overlay(alignment: .bottom) {
            if showingTooltip {
                Tooltip(text: tooltip)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(width: 224)
                    .offset(y: -size - 8)
                    .transition(.opacity)
                    .onTapGesture { showingTooltip = false }
            }
        }
        .animation(.easeOut(duration: 0.15), value: showingTooltip)
        .sensoryFeedback(.selection, trigger: showingTooltip)
    }
}

/// The website's scalloped badge: a disc ringed by 12 overlapping bumps, with a white check
private struct ScallopedCheck: View {
    var body: some View {
        Canvas { context, size in
            let scale = min(size.width, size.height) / 24
            func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat) -> Path {
                Path(ellipseIn: CGRect(x: (cx - r) * scale, y: (cy - r) * scale, width: 2 * r * scale, height: 2 * r * scale))
            }
            var badge = circle(12, 12, 8.4)
            for i in 0..<12 {
                let angle = Double(i) / 12 * 2 * .pi
                badge.addPath(circle(12 + cos(angle) * 8.2, 12 + sin(angle) * 8.2, 2.7))
            }
            context.fill(badge, with: .color(Theme.Colors.verified))

            var check = Path()
            check.move(to: CGPoint(x: 7.6 * scale, y: 12.3 * scale))
            check.addLine(to: CGPoint(x: 10.6 * scale, y: 15.3 * scale))
            check.addLine(to: CGPoint(x: 16.4 * scale, y: 8.9 * scale))
            context.stroke(
                check,
                with: .color(.white),
                style: StrokeStyle(lineWidth: 2.3 * scale, lineCap: .round, lineJoin: .round)
            )
        }
    }
}

private struct Tooltip: View {
    let text: String

    var body: some View {
        VStack(spacing: 0) {
            Text(text)
                .font(.system(size: Theme.FontSize.caption))
                .foregroundStyle(Theme.Colors.tooltipText)
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Theme.Colors.tooltipBackground, in: RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(Theme.Colors.verified.opacity(0.4), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.4), radius: 8, y: 4)
            // the little arrow pointing down at the check
            Triangle()
                .fill(Theme.Colors.tooltipBackground)
                .frame(width: 8, height: 4)
        }
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
            path.closeSubpath()
        }
    }
}
