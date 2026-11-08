//
//  Basics.swift
//  Gotcha
//
//  The small building blocks every screen uses, matching the website's look
//  (Tailwind slate, dark only). Colors and sizes come from Generated/Theme.swift.
//

import SwiftUI

/// The website's `bg-slate-800 p-4 rounded-lg` card
struct CardModifier: ViewModifier {
    var alignment: HorizontalAlignment = .center

    func body(content: Content) -> some View {
        VStack(alignment: alignment, spacing: 8) { content }
            .frame(maxWidth: .infinity, alignment: Alignment(horizontal: alignment, vertical: .center))
            .padding(Theme.Spacing.card)
            .background(Theme.Colors.card, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
    }
}

extension View {
    func card(alignment: HorizontalAlignment = .center) -> some View {
        modifier(CardModifier(alignment: alignment))
    }
}

/// A screen title, e.g. "Profile" (`font-bold text-xl`)
struct SectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: Theme.FontSize.title, weight: .bold))
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The header from the website's Layout: the hand logo and "Gotcha"
struct GotchaHeader: View {
    var body: some View {
        HStack(spacing: 4) {
            Image("GotchaLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 48, height: 48)
                .accessibilityLabel("The Classic Gotcha Outstretched Hand")
            Text(Copy.appName)
                .font(.system(size: Theme.FontSize.headline, weight: .bold))
            Spacer()
        }
        .padding(.horizontal, 8)
    }
}

/// The website's loading screen: a pulsing "G" with rotating tips
struct GotchaLoader: View {
    @State private var tip = Copy.loaderTips.randomElement() ?? ""
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle().fill(Theme.Colors.card)
                Text("G").font(.system(size: Theme.FontSize.headline, weight: .black))
            }
            .frame(width: 96, height: 96)
            .scaleEffect(pulse ? 1.12 : 1)
            .opacity(pulse ? 1 : 0.9)
            .animation(
                reduceMotion ? nil : .easeInOut(duration: Theme.Animation.loaderPulseSeconds / 2)
                    .repeatForever(autoreverses: true),
                value: pulse
            )
            Text(tip)
                .font(.system(size: 18, weight: .medium))
                .contentTransition(.opacity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.background)
        .onAppear { pulse = true }
        .task {
            var index = Copy.loaderTips.firstIndex(of: tip) ?? 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Theme.Animation.loaderTipSeconds))
                index = (index + 1) % Copy.loaderTips.count
                withAnimation { tip = Copy.loaderTips[index] }
            }
        }
    }
}

/// The website's error page ("Uh oh."), with a way to try again
struct ErrorView: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            Text(Copy.Errors.title)
                .font(.system(size: Theme.FontSize.error, weight: .bold))
            Text(message)
                .font(.system(size: Theme.FontSize.small))
                .foregroundStyle(Theme.Colors.error)
                .multilineTextAlignment(.center)
                .textSelection(.enabled)
            if let retry {
                Button(Copy.Errors.retry, action: retry)
                    .buttonStyle(SlateButtonStyle())
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.background)
    }
}

/// The website's `bg-slate-600 rounded-md` button
struct SlateButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 24)
            .padding(.vertical, 8)
            .background(
                configuration.isPressed ? Theme.Colors.buttonPressed : Theme.Colors.button,
                in: RoundedRectangle(cornerRadius: Theme.Radius.button)
            )
            .foregroundStyle(Theme.Colors.text)
    }
}
