//
//  GoogleSignInManager.swift
//  Gotcha
//
//  Created on 10/17/26.
//

import Combine
import FirebaseAuth
import FirebaseCore
import Foundation
import GoogleSignIn
import UIKit

@MainActor
final class GoogleSignInManager: ObservableObject {
    @Published var isSigningIn = false
    @Published var errorMessage: String?

    func signIn(presenting viewController: UIViewController) {
        guard !isSigningIn else { return }

        guard let clientID = FirebaseApp.app()?.options.clientID else {
            errorMessage = "Firebase client ID is missing."
            return
        }

        isSigningIn = true
        errorMessage = nil

        // hostedDomain makes Google offer school accounts first
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: clientID,
            serverClientID: nil,
            hostedDomain: AuthManager.schoolDomain,
            openIDRealm: nil
        )

        GIDSignIn.sharedInstance.signIn(withPresenting: viewController) { [weak self] result, error in
            Task { @MainActor in
                guard let self else { return }

                if let error {
                    // closing the Google sheet isn't an error worth showing
                    if (error as NSError).code != GIDSignInError.canceled.rawValue {
                        self.errorMessage = error.localizedDescription
                    }
                    self.isSigningIn = false
                    return
                }

                guard let googleUser = result?.user,
                      let idToken = googleUser.idToken?.tokenString else {
                    self.errorMessage = "Unable to retrieve Google credentials."
                    self.isSigningIn = false
                    return
                }

                let credential = GoogleAuthProvider.credential(
                    withIDToken: idToken,
                    accessToken: googleUser.accessToken.tokenString
                )
                await self.signIn(with: credential)
            }
        }
    }

    #if DEBUG
    /// Signs in to the Auth emulator as any roster email, like the emulator's Google popup on
    /// the website. The emulator accepts an unsigned Google ID token, so no real account is used.
    func signInToEmulator(email: String) {
        guard !isSigningIn else { return }
        let email = email.trimmingCharacters(in: .whitespaces).lowercased()
        let claims: [String: Any] = [
            "sub": "emulator-\(email)",
            "email": email,
            "email_verified": true,
            "name": email.components(separatedBy: "@").first ?? email,
        ]
        let base64url = { (data: Data) in
            data.base64EncodedString()
                .replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
        }
        guard let header = try? JSONSerialization.data(withJSONObject: ["alg": "none", "typ": "JWT"]),
              let payload = try? JSONSerialization.data(withJSONObject: claims) else { return }
        let token = "\(base64url(header)).\(base64url(payload))."

        isSigningIn = true
        errorMessage = nil
        Task {
            await signIn(with: GoogleAuthProvider.credential(withIDToken: token, accessToken: ""))
        }
    }
    #endif

    private func signIn(with credential: AuthCredential) async {
        do {
            try await Auth.auth().signIn(with: credential)
            // AuthManager sees the change on its own
        } catch {
            errorMessage = error.localizedDescription
        }
        isSigningIn = false
    }
}
