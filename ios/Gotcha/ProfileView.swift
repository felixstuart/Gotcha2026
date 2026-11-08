//
//  ProfileView.swift
//  Gotcha
//
//  The website's profile page (website/app/routes/profile.tsx), card for card.
//

import FirebaseAuth
import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var store: GameStore
    @EnvironmentObject private var auth: AuthManager
    let onTaggedOut: () -> Void

    @State private var isTaggingOut = false
    @State private var tagOutError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.stack) {
                GotchaHeader()
                if store.isOffline { OfflineBanner() }
                if let profile = store.profile {
                    if profile.role == .admin {
                        adminCard
                    } else {
                        playerCards(profile)
                    }
                }
            }
            .padding(Theme.Spacing.card)
        }
        .refreshable { await store.refresh(force: true) }
        .background(Theme.Colors.background)
        .alert(
            Copy.Profile.tagOut,
            isPresented: Binding(get: { tagOutError != nil }, set: { if !$0 { tagOutError = nil } })
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(tagOutError ?? "")
        }
    }

    // MARK: - Player

    @ViewBuilder
    private func playerCards(_ profile: Profile) -> some View {
        SectionTitle(text: Copy.Profile.title)
        identityCard(profile)

        tagsCard(profile)
        if profile.alive {
            TagOutButton(isWorking: isTaggingOut) { Task { await tagOut() } }
            targetCard(profile)
        }

        SectionTitle(text: Copy.Profile.lastWords)
        ForEach(store.lastWords) { entry in
            VStack(alignment: .leading, spacing: 4) {
                Text("\"\(entry.lw)\"").italic()
                Text(entry.attribution)
                    .font(.system(size: Theme.FontSize.small))
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
            .card(alignment: .leading)
        }
    }

    private func identityCard(_ profile: Profile) -> some View {
        let checkInSettings = store.settings.flatMap { profile.alive && $0.checkInEnabled ? $0 : nil }
        let checkedIn = checkInSettings != nil && profile.checkedInToday

        return VStack(spacing: 8) {
            ProfilePhoto(url: auth.user?.photoURL, initials: profile.initials)
            HStack(alignment: .center, spacing: 6) {
                Text(profile.fullName)
                    .font(.system(size: Theme.FontSize.headline, weight: .bold))
                if checkedIn, let settings = checkInSettings {
                    VerifiedCheck(tooltip: Copy.fill(Copy.CheckIn.checkedInTooltip, [
                        "where": settings.checkInWhere,
                        "deadline": settings.checkInDeadlineText,
                    ]))
                }
            }
            .padding(.top, 8)
            if let building = profile.location {
                Text(building)
                    .italic()
                    .fontWeight(.light)
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
            if let settings = checkInSettings, !checkedIn {
                CheckInBadge(
                    settings: settings,
                    locating: store.sharing == .locating,
                    hint: checkInHint(profile),
                    onCheckIn: store.checkIn
                )
            }
            Button(Copy.Nav.signOut) { auth.signOut() }
                .font(.system(size: Theme.FontSize.small))
                .foregroundStyle(Theme.Colors.textMuted)
                .padding(.top, 4)
        }
        .card()
        // covered for the day: a solid ring in the same blue as the check
        .overlay {
            if checkedIn {
                RoundedRectangle(cornerRadius: Theme.Radius.card)
                    .strokeBorder(Theme.Colors.checkedInRing, lineWidth: 2)
            }
        }
        .zIndex(1) // keeps the check's tooltip above the cards below
    }

    private func checkInHint(_ profile: Profile) -> String? {
        switch store.sharing {
        case .failed: Copy.CheckIn.needsLocation
        case .shared where profile.location == nil: Copy.CheckIn.notInBuilding
        default: nil
        }
    }

    private func tagsCard(_ profile: Profile) -> some View {
        VStack(spacing: 4) {
            Text(Copy.Profile.tags).font(.system(size: Theme.FontSize.title, weight: .semibold))
            Text("\(profile.tags)").font(.system(size: Theme.FontSize.headline, weight: .bold))
                .contentTransition(.numericText())
        }
        .card()
    }

    private func targetCard(_ profile: Profile) -> some View {
        VStack(spacing: 4) {
            Text(Copy.Profile.target).font(.system(size: Theme.FontSize.title, weight: .semibold))
            Text(profile.target.fullName).font(.system(size: Theme.FontSize.headline, weight: .bold))
            Text(profile.target.email)
                .italic()
                .fontWeight(.light)
                .foregroundStyle(Theme.Colors.textSecondary)
            targetLocation(profile)
        }
        .card()
    }

    /// The target's building, under a spoiler until it's allowed (same rules as the website)
    @ViewBuilder
    private func targetLocation(_ profile: Profile) -> some View {
        if let settings = store.settings, settings.showsTargetLocation {
            let hiddenUntilShared = settings.hidesTargetLocationUntilShared
            let waiting = hiddenUntilShared && store.sharing != .shared
            let building = profile.target.location
            if waiting || building != nil {
                VStack(spacing: 4) {
                    SpoilerText(text: building ?? Copy.Profile.targetLocationPlaceholder, hidden: waiting)
                    if waiting {
                        Text(store.sharing == .failed ? Copy.Profile.shareToSeeFailed : Copy.Profile.shareToSee)
                            .font(.system(size: Theme.FontSize.caption))
                            .foregroundStyle(Theme.Colors.textMuted)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.top, 8)
            }
        }
    }

    // MARK: - Admin

    private var adminCard: some View {
        VStack(spacing: 4) {
            SectionTitle(text: Copy.Profile.title)
            VStack(spacing: 4) {
                Text(Copy.Profile.adminTitle).font(.system(size: Theme.FontSize.headline, weight: .bold))
                Text(auth.user?.email ?? "").italic().foregroundStyle(Theme.Colors.textSecondary)
                Text(Copy.Profile.adminHint)
                    .font(.system(size: Theme.FontSize.small))
                    .foregroundStyle(Theme.Colors.textMuted)
                Button(Copy.Nav.signOut) { auth.signOut() }
                    .font(.system(size: Theme.FontSize.small))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .padding(.top, 4)
            }
            .card()
        }
    }

    // MARK: - Actions

    private func tagOut() async {
        isTaggingOut = true
        defer { isTaggingOut = false }
        do {
            try await store.tagOut()
            onTaggedOut()
        } catch {
            // e.g. "Gotcha hasn't started yet" (the website only logs these)
            tagOutError = error.localizedDescription
        }
    }
}

/// Their Google photo, or their initials when there isn't one
private struct ProfilePhoto: View {
    let url: URL?
    let initials: String

    var body: some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                ZStack {
                    Theme.Colors.button
                    Text(initials).font(.system(size: 30, weight: .bold)).foregroundStyle(Theme.Colors.textSecondary)
                }
            }
        }
        .frame(width: 96, height: 96)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

/// Shown over cached data when the last refresh couldn't reach the server
struct OfflineBanner: View {
    var body: some View {
        Label(Copy.Errors.offline, systemImage: "wifi.slash")
            .font(.system(size: Theme.FontSize.caption))
            .foregroundStyle(Theme.Colors.textMuted)
            .frame(maxWidth: .infinity)
    }
}
