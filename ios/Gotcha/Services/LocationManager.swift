//
//  LocationManager.swift
//  Gotcha
//
//  Gets one location fix when the app needs it (like the website's getCurrentPosition).
//  No background tracking: the server only needs the player's building when they open
//  the app or tap "check in".
//

import CoreLocation
import Foundation

enum LocationError: LocalizedError {
    case denied
    case unavailable

    var errorDescription: String? {
        switch self {
        case .denied: "Location access is off for Gotcha."
        case .unavailable: "Couldn't find your location."
        }
    }
}

final class LocationManager {
    /// A fix this accurate ends the search right away (meters)
    private nonisolated static let goodEnoughAccuracy: CLLocationAccuracy = 65
    /// Fixes less accurate than this are ignored
    private nonisolated static let worstAccuracy: CLLocationAccuracy = 150

    /// One location fix.
    /// - Parameters:
    ///   - maxAge: a recent fix this old or newer is used as is (the first attempt allows 60s;
    ///     a retry wants a fresh one, since they've probably moved)
    ///   - timeout: after this long, use the best fix so far or fail
    func currentLocation(maxAge: TimeInterval, timeout: TimeInterval = 10) async throws -> CLLocation {
        if maxAge > 0,
           let recent = CLLocationManager().location,
           -recent.timestamp.timeIntervalSinceNow <= maxAge,
           Self.isUsable(recent) {
            return recent
        }

        // holds when-in-use permission (and asks for it the first time) while we look
        let session = CLServiceSession(authorization: .whenInUse)
        defer { session.invalidate() }

        // the first time, give them as long as they need to answer the permission prompt;
        // the timeout is only for finding them
        if CLLocationManager().authorizationStatus == .notDetermined {
            try await Self.waitForPermissionAnswer()
        }

        return try await withThrowingTaskGroup(of: CLLocation?.self) { group in
            group.addTask { try await Self.searchForFix(until: timeout) }
            guard let location = try await group.next() ?? nil else {
                throw LocationError.unavailable
            }
            return location
        }
    }

    private nonisolated static func waitForPermissionAnswer() async throws {
        for try await update in CLLocationUpdate.liveUpdates() {
            if update.authorizationDenied || update.authorizationDeniedGlobally { throw LocationError.denied }
            if !update.authorizationRequestInProgress { return }
        }
    }

    /// Takes live updates until one is good enough, or returns the best one when time runs out
    private nonisolated static func searchForFix(until timeout: TimeInterval) async throws -> CLLocation? {
        let deadline = Date().addingTimeInterval(timeout)
        var best: CLLocation?

        let updates = CLLocationUpdate.liveUpdates()
        return try await withThrowingTaskGroup(of: CLLocation?.self) { group in
            group.addTask {
                for try await update in updates {
                    if update.authorizationDenied || update.authorizationDeniedGlobally {
                        throw LocationError.denied
                    }
                    guard let location = update.location, isUsable(location) else { continue }
                    if location.horizontalAccuracy <= goodEnoughAccuracy { return location }
                    if Date() >= deadline { return location }
                }
                return nil
            }
            group.addTask {
                try await Task.sleep(for: .seconds(timeout))
                return nil
            }
            defer { group.cancelAll() }
            // the first result decides: a fix, a denial, or the timeout (nil)
            best = try await group.next() ?? nil
            return best
        }
    }

    private nonisolated static func isUsable(_ location: CLLocation) -> Bool {
        location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= worstAccuracy
    }
}
