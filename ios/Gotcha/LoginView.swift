//
//  LoginView.swift
//  Gotcha
//
//  Created on 10/17/26.
//  The website's landing page: the GOTCHA wordmark and "Sign in with Google".
//

import SwiftUI
import UIKit

struct LoginView: View {
    @EnvironmentObject private var auth: AuthManager
    @StateObject private var googleSignIn = GoogleSignInManager()
    #if DEBUG
    @State private var emulatorEmail = ""
    #endif

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            Text(Copy.Landing.wordmark)
                .font(.system(size: Theme.FontSize.wordmark, weight: .black))
                .minimumScaleFactor(0.4)
                .lineLimit(1)
                .padding(.horizontal)
            Spacer()

            if let error = googleSignIn.errorMessage ?? auth.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Theme.Colors.error)
                    .multilineTextAlignment(.center)
                    .padding()
            }

            #if DEBUG
            emulatorSignIn
            #endif

            VStack(spacing: 12) {
                Button(action: startGoogleSignIn) {
                    HStack(spacing: 8) {
                        if googleSignIn.isSigningIn {
                            ProgressView().tint(Theme.Colors.text)
                        } else {
                            Image("GoogleLogo").resizable().scaledToFit().frame(width: 28, height: 28)
                        }
                        Text(Copy.Landing.signIn)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(SlateButtonStyle())
                .disabled(googleSignIn.isSigningIn)

                Text(Copy.Landing.footer)
                    .font(.system(size: Theme.FontSize.small))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .multilineTextAlignment(.center)
            }
            .padding(Theme.Spacing.card)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.background)
    }

    #if DEBUG
    /// Debug builds talk to the Auth emulator, which can sign in as any roster email
    private var emulatorSignIn: some View {
        HStack {
            TextField("Emulator: roster email", text: $emulatorEmail)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .accessibilityIdentifier("emulatorEmail")
            Button("Sign in") { googleSignIn.signInToEmulator(email: emulatorEmail) }
                .accessibilityIdentifier("emulatorSignIn")
                .disabled(emulatorEmail.isEmpty)
        }
        .font(.system(size: Theme.FontSize.small))
        .padding(10)
        .background(Theme.Colors.card, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .padding(.horizontal, Theme.Spacing.card)
    }
    #endif

    private func startGoogleSignIn() {
        auth.errorMessage = nil
        guard let controller = UIApplication.shared.gotchaRootViewController else {
            googleSignIn.errorMessage = "Unable to open Google Sign-In. Please try again."
            return
        }
        googleSignIn.signIn(presenting: controller)
    }
}

private extension UIApplication {
    var gotchaRootViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }?
            .windows
            .first { $0.isKeyWindow }?
            .rootViewController
    }
}
