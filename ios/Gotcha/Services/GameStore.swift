//
//  GameStore.swift
//  Gotcha
//
//  Everything the screens show, in one place. It loads from the on-disk cache first,
//  refreshes from the functions, and shares the player's location the same way the
//  website's profile page does (once per visit, and again on "check in").
//

import Combine
import CoreLocation
import Foundation
import OSLog

enum SharingState: Equatable {
    case idle, locating, shared, failed
}

@MainActor
final class GameStore: ObservableObject {
    @Published private(set) var profile: Profile?
    @Published private(set) var settings: GameSettings?
    @Published private(set) var leaderboard: WireLeaderboard?
    @Published private(set) var lastWords: [LastWordsEntry] = []

    /// A load failed and there's nothing cached to show instead
    @Published private(set) var loadError: String?
    /// Showing cached data because the last refresh couldn't reach the server
    @Published private(set) var isOffline = false
    @Published private(set) var sharing: SharingState = .idle

    private let service: GameService
    private let location: LocationManager
    private let cache: GameCache

    private var uid: String?
    /// Bumped on every sign in and sign out, so a call that finishes for an old session
    /// (or gets cancelled by signing out) can't touch the new one
    private var generation = 0
    private let log = Logger(subsystem: "com.miltonacademy.Gotcha", category: "GameStore")
    private var snapshot = GameCacheSnapshot()
    private var shareAttempt = 0
    private var shareTask: Task<Void, Never>?

    init(service: GameService? = nil, location: LocationManager? = nil, cache: GameCache? = nil) {
        self.service = service ?? GameService()
        self.location = location ?? LocationManager()
        self.cache = cache ?? GameCache()
    }

    // MARK: - Session

    /// Shows the signed-in player's cached data straight away, then refreshes it.
    func start(uid: String) async {
        guard self.uid != uid else { return }
        self.uid = uid
        generation += 1
        snapshot = cache.load(uid: uid)
        profile = snapshot.profile?.value
        settings = snapshot.settings?.value
        leaderboard = snapshot.leaderboard?.value ?? nil
        lastWords = snapshot.lastWords?.value ?? []
        await refresh(force: true)
    }

    func signOut() {
        shareTask?.cancel()
        cache.clearAll()
        uid = nil
        generation += 1
        snapshot = GameCacheSnapshot()
        profile = nil
        settings = nil
        leaderboard = nil
        lastWords = []
        loadError = nil
        isOffline = false
        sharing = .idle
        shareAttempt = 0
    }

    // MARK: - Loading

    /// Refreshes whatever is older than its TTL (or everything, when forced),
    /// then shares the player's location if anything uses it.
    func refresh(force: Bool = false) async {
        guard uid != nil else { return }
        let session = generation
        let now = Date()
        let needsProfile = force || !(snapshot.profile?.isFresh(for: CacheTTL.profile, now: now) ?? false)
        let needsSettings = force || !(snapshot.settings?.isFresh(for: CacheTTL.settings, now: now) ?? false)
        let needsLastWords = force || !(snapshot.lastWords?.isFresh(for: CacheTTL.lastWords, now: now) ?? false)

        do {
            // Optional(...) matters: getProfile itself returns Profile?, and without it a skipped
            // call (nil) would read as "the server said there's no profile"
            async let newProfile: Profile?? = needsProfile
                ? Optional(service.call(Callables.getProfile, GetProfileRequest(location: nil))) : nil
            async let newSettings: GameSettings? = needsSettings
                ? service.call(Callables.getGameSettings) : nil
            async let newLastWords: ClientLastWordsResponse? = needsLastWords
                ? service.call(Callables.getLastWords) : nil
            let (profile, settings, lastWords) = try await (newProfile, newSettings, newLastWords)

            guard session == generation else { return }
            if let settings { store(settings: settings) }
            if let profile {
                guard let profile else { throw GameError.other(Copy.Profile.noProfile) }
                store(profile: profile)
            }
            if let lastWords { store(lastWords: lastWords.lastWords) }
            loadError = nil
            isOffline = false
        } catch {
            fail(GameError(error), session: session)
        }

        if needsProfile && session == generation { shareLocationIfUsed(fresh: false) }
    }

    func refreshLeaderboard(force: Bool = false) async {
        guard uid != nil else { return }
        let session = generation
        let needsLeaderboard = force || !(snapshot.leaderboard?.isFresh(for: CacheTTL.leaderboard) ?? false)
        let needsSettings = !(snapshot.settings?.isFresh(for: CacheTTL.settings) ?? false)
        do {
            async let newLeaderboard: GetLeaderboardResponse? = needsLeaderboard
                ? service.call(Callables.getLeaderboard) : nil
            async let newSettings: GameSettings? = needsSettings
                ? service.call(Callables.getGameSettings) : nil
            let (leaderboard, settings) = try await (newLeaderboard, newSettings)

            guard session == generation else { return }
            if let settings { store(settings: settings) }
            if let leaderboard { store(leaderboard: leaderboard.leaderboard) }
            isOffline = false
        } catch {
            fail(GameError(error), session: session)
        }
    }

    private func fail(_ error: GameError, session: Int) {
        // signed out (or in as someone else) while it was loading: not this session's problem
        guard session == generation, !Task.isCancelled else {
            log.debug("Ignored a load error from an old session: \(error.localizedDescription, privacy: .public)")
            return
        }
        log.error("Load failed: \(error.localizedDescription, privacy: .public)")
        if profile != nil && error.isOffline {
            isOffline = true // keep showing what we have
        } else {
            loadError = error.localizedDescription
        }
    }

    // MARK: - Location

    /// Shares the player's location if anything uses it: their building for their chaser,
    /// check-in, and (with "share to see") their target's building.
    func shareLocationIfUsed(fresh: Bool) {
        guard let profile, let settings,
              profile.alive, profile.role == .player, settings.usesLocation else { return }
        shareTask?.cancel()
        shareAttempt += 1
        let maxAge: TimeInterval = fresh || shareAttempt > 1 ? 0 : 60
        sharing = .locating
        let session = generation
        shareTask = Task {
            do {
                let fix = try await location.currentLocation(maxAge: maxAge)
                let request = GetProfileRequest(location: [fix.coordinate.latitude, fix.coordinate.longitude])
                guard let updated = try await service.call(Callables.getProfile, request) else {
                    throw GameError.other(Copy.Profile.noProfile)
                }
                guard !Task.isCancelled, session == generation else { return }
                store(profile: updated)
                sharing = .shared
            } catch {
                // sharing is best-effort, the app keeps working without it
                guard !Task.isCancelled, session == generation else { return }
                log.notice("Location sharing failed: \(error.localizedDescription, privacy: .public)")
                sharing = .failed
            }
        }
    }

    /// "check in" on the profile: share a fresh location
    func checkIn() {
        shareLocationIfUsed(fresh: true)
    }

    // MARK: - Actions

    func tagOut() async throws {
        do {
            _ = try await service.call(Callables.tagOut)
        } catch {
            throw GameError(error)
        }
        // they're out now: forget the old profile and leaderboard, then reload
        snapshot.profile = nil
        snapshot.leaderboard = nil
        shareTask?.cancel()
        sharing = .idle
        await refresh(force: true)
        await refreshLeaderboard(force: true)
    }

    func submitLastWords(_ text: String) async throws {
        _ = try await service.call(Callables.setLastWords, SetLastWordsRequest(lastWords: text))
        snapshot.lastWords = nil
        await refresh()
    }

    // MARK: - Storing

    private func store(profile: Profile) {
        self.profile = profile
        snapshot.profile = Stamped(value: profile, fetchedAt: Date())
        save()
    }

    private func store(settings: GameSettings) {
        self.settings = settings
        snapshot.settings = Stamped(value: settings, fetchedAt: Date())
        save()
    }

    private func store(leaderboard: WireLeaderboard?) {
        self.leaderboard = leaderboard
        snapshot.leaderboard = Stamped(value: leaderboard, fetchedAt: Date())
        save()
    }

    private func store(lastWords: [LastWordsEntry]) {
        self.lastWords = lastWords
        snapshot.lastWords = Stamped(value: lastWords, fetchedAt: Date())
        save()
    }

    private func save() {
        guard let uid else { return }
        cache.save(snapshot, uid: uid)
    }
}
