//
//  GameCache.swift
//  Gotcha
//
//  Keeps the last responses on disk so the app opens instantly, then refreshes them.
//  One file per signed-in player, cleared on sign out. The target's building is never
//  saved: with "share to see" on it's only allowed in the response that revealed it.
//

import Foundation

struct Stamped<Value: Codable>: Codable {
    var value: Value
    var fetchedAt: Date

    func isFresh(for ttl: TimeInterval, now: Date = Date()) -> Bool {
        now.timeIntervalSince(fetchedAt) < ttl
    }
}

struct GameCacheSnapshot: Codable {
    var profile: Stamped<Profile>?
    var settings: Stamped<GameSettings>?
    var leaderboard: Stamped<WireLeaderboard?>?
    var lastWords: Stamped<[LastWordsEntry]>?
}

enum CacheTTL {
    static let profile: TimeInterval = 30
    static let settings: TimeInterval = 5 * 60
    static let leaderboard: TimeInterval = 60
    static let lastWords: TimeInterval = 5 * 60
}

final class GameCache {
    private let directory: URL

    init(directory: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("gotcha-cache", isDirectory: true)) {
        self.directory = directory
    }

    private func file(for uid: String) -> URL {
        directory.appendingPathComponent("\(uid).json")
    }

    func load(uid: String) -> GameCacheSnapshot {
        guard let data = try? Data(contentsOf: file(for: uid)),
              let snapshot = try? JSONDecoder().decode(GameCacheSnapshot.self, from: data) else {
            return GameCacheSnapshot()
        }
        return snapshot
    }

    func save(_ snapshot: GameCacheSnapshot, uid: String) {
        var snapshot = snapshot
        if let profile = snapshot.profile {
            snapshot.profile = Stamped(
                value: profile.value.withoutTargetLocation(),
                fetchedAt: profile.fetchedAt
            )
        }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try JSONEncoder().encode(snapshot).write(to: file(for: uid), options: .atomic)
        } catch {
            print("Couldn't save the cache:", error)
        }
    }

    /// Everyone's cache, e.g. on sign out
    func clearAll() {
        try? FileManager.default.removeItem(at: directory)
    }
}
