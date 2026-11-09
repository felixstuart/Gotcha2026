//
//  TagOutButton.swift
//  Gotcha
//
//  The website's hold-to-confirm Tag Out button (components/TagOut.tsx): hold for 2s while
//  it fills with rose, then let go on the button to confirm. Letting go early, or sliding
//  off it, rewinds the fill.
//

import SwiftUI

struct TagOutButton: View {
    var isWorking = false
    let onConfirm: () -> Void

    private enum HoldState { case idle, inProgress, complete }

    @State private var state: HoldState = .idle
    @State private var progress: CGFloat = 0
    @State private var holdTask: Task<Void, Never>?

    private var label: String {
        switch state {
        case .idle: Copy.Profile.tagOut
        case .inProgress: Copy.Profile.holdToConfirm
        case .complete: Copy.Profile.releaseToConfirm
        }
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Rectangle().fill(Theme.Colors.button)
                Rectangle()
                    .fill(Theme.Colors.tagOutFill)
                    .frame(width: geometry.size.width * progress)
                Group {
                    if isWorking {
                        ProgressView().tint(Theme.Colors.text)
                    } else {
                        Text(label)
                            .id(label)
                            .transition(.asymmetric(
                                insertion: .offset(y: -12).combined(with: .opacity),
                                removal: .offset(y: 12).combined(with: .opacity)
                            ))
                    }
                }
                .font(.system(size: Theme.FontSize.headline, weight: .bold))
                .frame(maxWidth: .infinity)
            }
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let inside = CGRect(origin: .zero, size: geometry.size).contains(value.location)
                        if !inside {
                            if state != .idle { cancel() }
                        } else if state == .idle && holdTask == nil {
                            start()
                        }
                    }
                    .onEnded { value in
                        let inside = CGRect(origin: .zero, size: geometry.size).contains(value.location)
                        if state == .complete && inside {
                            confirm()
                        } else {
                            cancel()
                        }
                    }
            )
        }
        .frame(height: 112)
        .disabled(isWorking)
        .sensoryFeedback(.impact(weight: .heavy), trigger: state == .complete)
        .accessibilityElement()
        .accessibilityLabel(Copy.Profile.tagOut)
        .accessibilityHint(Copy.Profile.holdToConfirm)
        .accessibilityAction { onConfirm() } // VoiceOver can't hold, so a double tap confirms
    }

    private func start() {
        withAnimation(.easeInOut(duration: 0.15)) { state = .inProgress }
        withAnimation(.linear(duration: Theme.Animation.tagOutHoldSeconds)) { progress = 1 }
        holdTask = Task {
            try? await Task.sleep(for: .seconds(Theme.Animation.tagOutHoldSeconds))
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.15)) { state = .complete }
        }
    }

    private func cancel() {
        holdTask?.cancel()
        holdTask = nil
        withAnimation(.easeInOut(duration: 0.15)) { state = .idle }
        withAnimation(.linear(duration: Theme.Animation.tagOutRewindSeconds)) { progress = 0 }
    }

    private func confirm() {
        holdTask = nil
        withAnimation(.linear(duration: 0.2)) { progress = 0 }
        state = .idle
        onConfirm()
    }
}
