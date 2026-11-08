//
//  ContentView.swift
//  Gotcha
//
//  Created on 1/1/26.
//

import SwiftUI

/// The signed-in app: Profile and Leaderboard, like the website's nav
struct ContentView: View {
    @EnvironmentObject private var store: GameStore
    @State private var selection = AppTab.profile
    @State private var showingLastWords = false

    enum AppTab: Hashable { case profile, leaderboard }

    var body: some View {
        Group {
            if store.profile == nil {
                if let error = store.loadError {
                    ErrorView(message: error) { Task { await store.refresh(force: true) } }
                } else {
                    GotchaLoader()
                }
            } else {
                TabView(selection: $selection) {
                    Tab(Copy.Nav.profile, systemImage: "person.crop.circle", value: AppTab.profile) {
                        ProfileView(onTaggedOut: { showingLastWords = true })
                    }
                    Tab(Copy.Nav.leaderboard, systemImage: "trophy", value: AppTab.leaderboard) {
                        LeaderboardView()
                    }
                }
                .tint(Theme.Colors.text)
            }
        }
        .fullScreenCover(isPresented: $showingLastWords) {
            LastWordsView {
                showingLastWords = false
                selection = .leaderboard
            }
        }
    }
}
