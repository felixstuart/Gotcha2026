//
//  GotchaApp.swift
//  Gotcha
//

import FirebaseAuth
import FirebaseCore
import FirebaseFunctions
import GoogleSignIn
import SwiftUI

@main
struct GotchaApp: App {
    @StateObject private var authManager: AuthManager
    @StateObject private var store: GameStore
    @Environment(\.scenePhase) private var scenePhase

    init() {
        #if DEBUG
        // UI tests may select a demo project, but only with backend emulators enabled.
        if ProcessInfo.processInfo.environment["GOTCHA_USE_FIREBASE_EMULATORS"] == "1",
           let project = ProcessInfo.processInfo.environment["GOTCHA_FIREBASE_PROJECT_ID"],
           let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: path) {
            options.projectID = project
            FirebaseApp.configure(options: options)
        } else {
            FirebaseApp.configure()
        }
        #else
        FirebaseApp.configure()
        #endif

        #if DEBUG
        // The local Firebase emulators (see firebase.json). The app only uses Auth and Functions;
        // Firestore is locked to clients. On a real phone, set GOTCHA_EMULATOR_HOST to the
        // Mac's LAN address in the scheme's environment variables.
        if ProcessInfo.processInfo.environment["GOTCHA_USE_FIREBASE_EMULATORS"] == "1" {
            let host = ProcessInfo.processInfo.environment["GOTCHA_EMULATOR_HOST"] ?? "127.0.0.1"
            Auth.auth().useEmulator(withHost: host, port: 9099)
            Functions.functions(region: Callables.region).useEmulator(withHost: host, port: 5001)
        }
        #endif

        // created after Firebase is configured
        _authManager = StateObject(wrappedValue: AuthManager())
        _store = StateObject(wrappedValue: GameStore())
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if authManager.isLoading {
                    GotchaLoader()
                } else if let user = authManager.user {
                    ContentView()
                        .task(id: user.uid) { await store.start(uid: user.uid) }
                } else {
                    LoginView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.background)
            .foregroundStyle(Theme.Colors.text)
            .preferredColorScheme(.dark)
            .environmentObject(authManager)
            .environmentObject(store)
            .onChange(of: authManager.user?.uid) { _, newUID in
                if newUID == nil { store.signOut() }
            }
            .onChange(of: scenePhase) { _, phase in
                // back in the app: refresh anything that's gone stale
                if phase == .active, authManager.user != nil {
                    Task { await store.refresh() }
                }
            }
            .onOpenURL { url in
                GIDSignIn.sharedInstance.handle(url)
            }
        }
    }
}
