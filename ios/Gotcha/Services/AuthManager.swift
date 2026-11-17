//
//  AuthManager.swift
//  Gotcha
//
//  Created on 10/17/26.
//

import Combine
import FirebaseAuth
import Foundation
import GoogleSignIn

@MainActor
final class AuthManager: ObservableObject {
    static let schoolDomain = "milton.edu"
    /// TEMPORARY (added 2026-11-12): the App Store review account. Must match REVIEW_EMAILS in
    /// functions/src/authorization.ts; remove both once the app is approved.
    static let reviewEmails: Set<String> = ["testforgotcha123@gmail.com"]

    static func isAllowed(email: String?) -> Bool {
        guard let email = email?.lowercased() else { return false }
        return email.hasSuffix("@\(schoolDomain)") || reviewEmails.contains(email)
    }

    @Published var user: User?
    @Published var isLoading = true
    @Published var errorMessage: String?

    private var listener: AuthStateDidChangeListenerHandle?

    init() {
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                guard let self else { return }
                // only school accounts can play (the website sends anyone else back to sign in)
                if let user, !Self.isAllowed(email: user.email) {
                    self.errorMessage = Copy.Landing.schoolAccountOnly
                    self.signOut(keepingError: true)
                    return
                }
                self.user = user
                self.isLoading = false
            }
        }
    }

    func signOut(keepingError: Bool = false) {
        do {
            try Auth.auth().signOut()
            GIDSignIn.sharedInstance.signOut()
            if !keepingError { errorMessage = nil }
        } catch {
            errorMessage = "Unable to sign out. Please try again."
        }
    }

    deinit {
        if let listener {
            Auth.auth().removeStateDidChangeListener(listener)
        }
    }
}
