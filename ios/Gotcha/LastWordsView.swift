//
//  LastWordsView.swift
//  Gotcha
//
//  Shown right after tagging out, like the website's last-words page: one chance to
//  leave last words, then on to the leaderboard.
//

import FirebaseAuth
import FirebaseFunctions
import SwiftUI

struct LastWordsView: View {
    @EnvironmentObject private var store: GameStore
    let onDone: () -> Void

    @State private var text = ""
    @State private var error: String?
    @State private var isSubmitting = false
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            GlyphRain().ignoresSafeArea()
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text(Copy.LastWords.title)
                        .font(.system(size: 36, weight: .bold))
                        .tracking(-0.5)
                    Text(Copy.LastWords.prompt)
                        .foregroundStyle(Theme.Colors.textMuted)
                }
                TextField(Copy.LastWords.placeholder, text: $text)
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit { Task { await submit() } }
                    .onChange(of: text) { _, new in
                        if new.count > Copy.LastWords.maxLength {
                            text = String(new.prefix(Copy.LastWords.maxLength))
                        }
                    }
                    .padding(12)
                    .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: Theme.Radius.card))
                if let error {
                    Text(error)
                        .font(.system(size: Theme.FontSize.small))
                        .foregroundStyle(Theme.Colors.error)
                }
                Button { Task { await submit() } } label: {
                    Group {
                        if isSubmitting { ProgressView().tint(.black) } else { Text(Copy.LastWords.submit) }
                    }
                    .font(.system(size: Theme.FontSize.body, weight: .semibold))
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(.white, in: Capsule())
                    .foregroundStyle(.black)
                }
                .disabled(isSubmitting)
            }
            .padding(32)
        }
        .background(Theme.Colors.lastWordsBackground)
        .preferredColorScheme(.dark)
        .onAppear { focused = true }
    }

    private func submit() async {
        error = nil
        let lastWords = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !lastWords.isEmpty else {
            error = Copy.LastWords.empty
            return
        }
        guard Auth.auth().currentUser?.email != nil else {
            error = Copy.LastWords.notSignedIn
            return
        }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            try await store.submitLastWords(lastWords)
            onDone()
        } catch {
            // the website's messages for the same errors
            switch (error as? GameError)?.code {
            case .alreadyExists: self.error = Copy.LastWords.alreadySubmitted
            case .unauthenticated: self.error = Copy.LastWords.signInAgain
            default: self.error = Copy.LastWords.unknown
            }
        }
    }
}

/// A quiet stand-in for the website's LetterGlitch background
private struct GlyphRain: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let glyphs = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$&*<>")
    private let colors = [Theme.Colors.glitch1, Theme.Colors.glitch2, Theme.Colors.glitch3]

    var body: some View {
        TimelineView(.periodic(from: .now, by: reduceMotion ? 3600 : 0.12)) { timeline in
            Canvas { context, size in
                let cell: CGFloat = 18
                let columns = Int(size.width / cell) + 1
                let rows = Int(size.height / cell) + 1
                let tick = Int(timeline.date.timeIntervalSinceReferenceDate / 0.12)
                for row in 0..<rows {
                    for column in 0..<columns {
                        var hash = UInt64(row &* 73_856_093 ^ column &* 19_349_663)
                        // only a few cells change each tick
                        hash = hash &+ UInt64((tick + (row * columns + column)) / 23)
                        hash = hash &* 6_364_136_223_846_793_005 &+ 1
                        let glyph = glyphs[Int(hash >> 33) % glyphs.count]
                        let color = colors[Int(hash >> 13) % colors.count]
                        context.draw(
                            Text(String(glyph)).font(.system(size: 14, design: .monospaced)).foregroundStyle(color),
                            at: CGPoint(x: CGFloat(column) * cell + cell / 2, y: CGFloat(row) * cell + cell / 2)
                        )
                    }
                }
            }
        }
        .opacity(0.35)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
