//
//  LeaderboardView.swift
//  Gotcha
//
//  The website's leaderboard (website/app/routes/leaderboard.tsx): countdown, classes,
//  dorms and top taggers, from the real leaderboard instead of sample data.
//

import SwiftUI

struct LeaderboardView: View {
    @EnvironmentObject private var store: GameStore

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                GotchaHeader()
                if store.isOffline { OfflineBanner() }
                Countdown(startsAt: store.settings?.startsAt, endsAt: store.settings?.endsAt)

                if let leaderboard = store.leaderboard {
                    HStack(alignment: .top, spacing: 16) {
                        tally(Copy.Leaderboard.classes, leaderboard.byClass.map { ($0.className, $0.tags) })
                        tally(Copy.Leaderboard.dorms, leaderboard.byDorms.map { ($0.dorm, $0.tags) })
                    }

                    VStack(spacing: Theme.Spacing.list) {
                        SectionTitle(text: Copy.Leaderboard.title)
                        ForEach(Array(leaderboard.topTaggers.enumerated()), id: \.offset) { index, tagger in
                            LeaderboardCard(
                                position: index + 1,
                                name: tagger.name,
                                tags: tagger.tags,
                                isYou: tagger.name == store.profile?.fullName
                            )
                        }
                    }
                } else {
                    ProgressView().padding(.top, 40)
                }
            }
            .padding(Theme.Spacing.card)
        }
        .background(Theme.Colors.background)
        .refreshable { await store.refreshLeaderboard(force: true) }
        .task { await store.refreshLeaderboard() }
    }

    private func tally(_ title: String, _ rows: [(name: String, tags: Int)]) -> some View {
        VStack(spacing: Theme.Spacing.list) {
            Text(title).font(.system(size: Theme.FontSize.title, weight: .bold))
                .padding(.bottom, 8)
            ForEach(rows, id: \.name) { row in
                HStack {
                    Text(row.name.capitalized).fontWeight(.medium)
                    Spacer()
                    Text("\(row.tags)").bold()
                }
                .padding(Theme.Spacing.row)
                .background(Theme.Colors.row, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// "Starts in 1d 2h 3m 4s", then the time left, then "Gotcha is Over!"
private struct Countdown: View {
    let startsAt: Double?
    let endsAt: Double?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            let text = label(now: timeline.date.milliseconds)
            if !text.isEmpty {
                Text(text)
                    .font(.system(size: Theme.FontSize.countdown, weight: .bold))
                    .foregroundStyle(Theme.Colors.countdown)
                    .multilineTextAlignment(.center)
                    .monospacedDigit()
            }
        }
    }

    private func label(now: Double) -> String {
        if let startsAt, now < startsAt {
            return Copy.fill(Copy.Leaderboard.startsIn, ["time": format(startsAt - now)])
        }
        guard let endsAt else { return "" } // nothing to count down to yet
        if now >= endsAt { return Copy.Leaderboard.over }
        return format(endsAt - now)
    }

    private func format(_ ms: Double) -> String {
        let seconds = Int(ms / 1000)
        return "\(seconds / 86400)d \(seconds / 3600 % 24)h \(seconds / 60 % 60)m \(seconds % 60)s"
    }
}
