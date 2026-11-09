//
//  GotchaFlowTests.swift
//  GotchaUITests
//
//  End-to-end checks against the local Firebase emulators, as a seeded player.
//  Setup (from the Gotcha2026 repo): `firebase emulators:start`, `npx tsx seed.ts`, then turn on
//  location, check-in and share-to-see in the admin Gameplay page.
//  Location is controlled from outside the app:
//    xcrun simctl privacy booted revoke location com.miltonacademy.Gotcha   (test 1)
//    xcrun simctl privacy booted grant location com.miltonacademy.Gotcha    (test 2)
//    xcrun simctl location booted set 42.255666,-71.070007                  (inside a building)
//

import XCTest

final class GotchaFlowTests: XCTestCase {
    /// A seeded player (seed.ts). Override with GOTCHA_TEST_EMAIL.
    private var email: String {
        ProcessInfo.processInfo.environment["GOTCHA_TEST_EMAIL"] ?? "alice_smith@milton.edu"
    }

    private let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = false
    }

    /// Without location: the target's building stays under the sand, with the website's hints.
    @MainActor
    func test1_ProfileWithoutLocation() {
        app.launch()
        signOutIfNeeded()
        signIn()

        XCTAssertTrue(app.staticTexts["Tags"].waitForExistence(timeout: 30), "profile didn't load")
        XCTAssertTrue(app.staticTexts["Target"].exists)

        // the app asks once; until they answer, it waits instead of giving up
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let dontAllow = springboard.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Don'")).firstMatch
        if dontAllow.waitForExistence(timeout: 15) {
            sleep(12) // longer than the location timeout
            XCTAssertFalse(
                app.staticTexts["Turn on your location to see where your target is."].exists,
                "gave up on location while the permission prompt was still open"
            )
            screenshot("0-permission-prompt")
            dontAllow.tap()
        }

        let hint = app.staticTexts["Turn on your location to see where your target is."]
        XCTAssertTrue(hint.waitForExistence(timeout: 20), "share-to-see hint missing")
        XCTAssertTrue(element(labelContains: "check-in needs your location").waitForExistence(timeout: 5))
        XCTAssertTrue(element(labelBeginsWith: "Check in at any building by").exists, "check-in button missing")
        XCTAssertFalse(element(labelContains: "Showing saved data").exists, "offline banner shown while online")
        sleep(1)
        screenshot("1-profile-no-location")

        // the target's building, still under the spoiler
        app.swipeUp()
        sleep(1)
        XCTAssertTrue(element(labelContains: "Somewhere on campus").exists, "spoiler missing")
        screenshot("1b-target-spoiler")
    }

    /// With location inside a building: checked in, the target's building revealed, then the
    /// leaderboard, tag out and last words.
    @MainActor
    func test2_LocationCheckInAndTagOut() {
        app.launch()
        signIn()

        // the cached profile shows straight away, before any network call finishes
        XCTAssertTrue(app.staticTexts["Tags"].waitForExistence(timeout: 30))
        screenshot("2-profile-from-cache")

        // the blue check by their name
        let check = app.buttons["Checked in"]
        XCTAssertTrue(check.waitForExistence(timeout: 30), "check-in didn't happen")
        XCTAssertFalse(element(labelBeginsWith: "Check in at").exists, "check-in button still showing")
        XCTAssertTrue(element(labelContains: "Faulkner House").waitForExistence(timeout: 10), "target's building wasn't revealed")
        XCTAssertFalse(element(labelContains: "Showing saved data").exists, "offline banner shown while online")
        sleep(2) // let the spoiler finish fading
        screenshot("3-profile-checked-in")

        check.tap()
        XCTAssertTrue(element(labelBeginsWith: "You're checked in for today").waitForExistence(timeout: 5), "tooltip missing")
        screenshot("3b-checked-in-tooltip")
        check.tap()

        app.tabBars.buttons["Leaderboard"].tap()
        XCTAssertTrue(app.staticTexts["Classes"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Dorms"].exists)
        sleep(1)
        screenshot("4-leaderboard")

        app.tabBars.buttons["Profile"].tap()
        let tagOut = element(labelBeginsWith: "Tag Out")
        XCTAssertTrue(tagOut.waitForExistence(timeout: 10))
        tagOut.press(forDuration: 2.8)

        let field = app.textFields["I'll be back..."]
        XCTAssertTrue(field.waitForExistence(timeout: 20), "last words screen didn't open")
        screenshot("5-last-words")
        field.tap()
        field.typeText("Tell Bob I said hi")
        app.buttons["Submit"].tap()

        XCTAssertTrue(app.staticTexts["Classes"].waitForExistence(timeout: 20), "didn't go to the leaderboard")
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(element(labelContains: "Tell Bob I said hi").waitForExistence(timeout: 20), "last words not listed")
        XCTAssertFalse(app.staticTexts["Target"].exists, "still shows a target after tagging out")
        screenshot("6-tagged-out")
    }

    // MARK: - Helpers

    @MainActor
    private func signIn() {
        let field = app.textFields["emulatorEmail"]
        guard field.waitForExistence(timeout: 10) else { return } // already signed in
        field.tap()
        field.typeText(email)
        app.buttons["emulatorSignIn"].tap()
    }

    @MainActor
    private func signOutIfNeeded() {
        let signOut = app.buttons["Sign out"]
        if signOut.waitForExistence(timeout: 8) { signOut.tap() }
    }

    @MainActor
    private func element(labelBeginsWith prefix: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
    }

    @MainActor
    private func element(labelContains text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    @MainActor
    private func screenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
