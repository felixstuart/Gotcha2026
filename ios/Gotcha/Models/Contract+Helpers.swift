//
//  Contract+Helpers.swift
//  Gotcha
//
//  Small conveniences on the generated contract types (Generated/Contract.swift).
//  The types themselves come from the Gotcha2026 repo's types.ts, so don't redeclare them here.
//

import Foundation

extension Profile {
    var fullName: String { "\(firstName) \(lastName)" }

    var initials: String {
        "\(firstName.first.map(String.init) ?? "")\(lastName.first.map(String.init) ?? "")"
    }

    /// Whether checkedInAt falls on today's school day (America/New_York), like the website.
    var checkedInToday: Bool {
        guard let checkedInAt else { return false }
        return SchoolTime.isSameDay(Date(milliseconds: checkedInAt), Date())
    }

    /// The same profile without the target's building. That only ever comes in the response
    /// to a call where it's allowed (share to see), so it's never kept on disk.
    func withoutTargetLocation() -> Profile {
        Profile(
            alive: alive,
            chaser: chaser,
            checkedInAt: checkedInAt,
            className: className,
            dayorboard: dayorboard,
            firstName: firstName,
            lastEditedAt: lastEditedAt,
            lastEditedBy: lastEditedBy,
            lastName: lastName,
            location: location,
            role: role,
            tags: tags,
            target: Target(
                email: target.email,
                firstName: target.firstName,
                lastName: target.lastName,
                location: nil
            )
        )
    }
}

extension Target {
    var fullName: String { "\(firstName) \(lastName)" }
}

enum GamePhase {
    case before, live, over
}

extension GameSettings {
    /// The server doesn't send a phase, so work it out from the times like the website does.
    func phase(at now: Date = Date()) -> GamePhase {
        let ms = now.milliseconds
        if let startsAt, ms < startsAt { return .before }
        if let endsAt, ms >= endsAt { return .over }
        return .live
    }

    /// Players share their location when something uses it (the website's rule).
    var usesLocation: Bool { locationEnabled || checkInEnabled }

    /// The target's building is a location feature, so it's off whenever location is.
    var showsTargetLocation: Bool { locationEnabled && seeTargetLocation }

    /// With "share to see" on, the target's building only comes back after sharing.
    var hidesTargetLocationUntilShared: Bool { showsTargetLocation && shareToSeeTargetLocation }

    /// e.g. 1200 -> "8:00 PM"
    var checkInDeadlineText: String { SchoolTime.formatMinutes(checkInDeadline) }

    var checkInWhere: String { checkInBuilding ?? Copy.CheckIn.anyBuilding }
}

extension LastUpdated {
    var date: Date? {
        switch self {
        case .double(let ms): Date(milliseconds: ms)
        case .wireTimestamp(let ts): Date(timeIntervalSince1970: ts.seconds + ts.nanoseconds / 1_000_000_000)
        case .null: nil
        }
    }
}

extension LastWordsEntry: Identifiable {
    var id: String { "\(author)-\(timestamp)" }

    var attribution: String {
        let date = Date(milliseconds: timestamp).formatted(date: .numeric, time: .shortened)
        return Copy.fill(Copy.Profile.lastWordsAttribution, ["author": author, "date": date])
    }
}

/// School days are in the school's time zone, the same as functions/src/schoolTime.ts.
enum SchoolTime {
    static let timeZone = TimeZone(identifier: "America/New_York")!

    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    static func isSameDay(_ a: Date, _ b: Date) -> Bool {
        calendar.isDate(a, inSameDayAs: b)
    }

    static func formatMinutes(_ minutes: Int) -> String {
        let hours = minutes / 60
        let hour12 = hours % 12 == 0 ? 12 : hours % 12
        return String(format: "%d:%02d %@", hour12, minutes % 60, hours < 12 ? "AM" : "PM")
    }
}

extension Date {
    init(milliseconds: Double) {
        self.init(timeIntervalSince1970: milliseconds / 1000)
    }

    var milliseconds: Double { timeIntervalSince1970 * 1000 }
}
