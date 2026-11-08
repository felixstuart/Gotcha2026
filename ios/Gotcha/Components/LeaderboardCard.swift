//
//  LeaderboardCard.swift
//  Gotcha
//
//  One row of the top taggers (website components/LeaderboardCard.tsx).
//

import SwiftUI

struct LeaderboardCard: View {
    let position: Int
    let name: String
    let tags: Int
    var isYou = false

    private var positionColor: Color {
        switch position {
        case 1: Theme.Colors.rankFirst
        case 2: Theme.Colors.rankSecond
        case 3: Theme.Colors.rankThird
        default: Theme.Colors.rankOther
        }
    }

    var body: some View {
        HStack(spacing: 16) {
            Text("\(position)")
                .frame(width: 32, height: 32)
                .background(positionColor, in: Circle())
            Text(name).bold()
                .frame(maxWidth: .infinity, alignment: .leading)
            if isYou {
                Text(Copy.Leaderboard.you)
                    .font(.system(size: Theme.FontSize.caption, weight: .semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Theme.Colors.card, in: Capsule())
            }
            Text("\(tags)")
        }
        .padding(Theme.Spacing.card)
        .background(Theme.Colors.button, in: RoundedRectangle(cornerRadius: Theme.Radius.leaderboardCard))
        .overlay {
            if isYou {
                RoundedRectangle(cornerRadius: Theme.Radius.leaderboardCard)
                    .strokeBorder(Theme.Colors.youHighlight.opacity(0.7), lineWidth: 1.5)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
