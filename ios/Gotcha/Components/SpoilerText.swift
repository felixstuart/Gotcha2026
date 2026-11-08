//
//  SpoilerText.swift
//  Gotcha
//
//  The website's target-location spoiler (the `spoiled` package's <Spoiler>, dark theme).
//  Hidden, the text is covered by a field of tiny shimmering particles. Revealed, the
//  particles fade away and the text opens out from its center (the "iris" transition).
//  It can't be revealed by tapping: only sharing your location does that.
//

import SwiftUI

struct SpoilerText: View {
    let text: String
    let hidden: Bool
    var font: Font = .system(size: 18, weight: .semibold)

    @State private var revealedAt: Date?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Text(text)
            .font(font)
            .opacity(hidden ? 0 : 1)
            .blur(radius: hidden ? 1 : 0)
            .mask { Iris(open: !hidden) }
            .animation(
                hidden
                    ? .easeOut(duration: Theme.Animation.spoilerHideSeconds)
                    : .easeOut(duration: Theme.Animation.spoilerRevealSeconds),
                value: hidden
            )
            .overlay {
                if hidden || revealedAt != nil {
                    SpoilerNoise(revealedAt: hidden ? nil : revealedAt, animated: !reduceMotion)
                        .allowsHitTesting(false)
                }
            }
            .onChange(of: hidden) { _, isHidden in
                revealedAt = isHidden ? nil : Date()
            }
            .task(id: revealedAt) {
                // once the particles have faded away, stop drawing them
                guard revealedAt != nil else { return }
                try? await Task.sleep(for: .seconds(Theme.Animation.spoilerNoiseFadeSeconds))
                if !hidden { revealedAt = nil }
            }
            // one element for the whole thing: hidden text (opacity 0) would otherwise be
            // left out, and VoiceOver would skip the spoiler entirely
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(hidden ? Copy.Profile.targetLocationPlaceholder : text)
    }
}

/// A circle that grows from the center to uncover the text
private struct Iris: View {
    let open: Bool

    var body: some View {
        GeometryReader { geometry in
            let diameter = hypot(geometry.size.width, geometry.size.height) + 32
            RadialGradient(
                colors: [.black, .black, .clear],
                center: .center,
                startRadius: 0,
                endRadius: diameter / 2
            )
            .frame(width: diameter, height: diameter)
            .scaleEffect(open ? 1 : 0.001)
            .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
        }
    }
}

/// The particle field, following the `spoiled` painter: each particle lives 0.3–1.5s, grows in
/// over 0.15s, shrinks away over its last 0.3s, drifts in a random direction and fades as it ages.
private struct SpoilerNoise: View {
    let revealedAt: Date?
    let animated: Bool

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1 / Theme.Animation.spoilerFPS)) { timeline in
            let now = timeline.date
            let time = animated ? now.timeIntervalSinceReferenceDate : 0
            // after a reveal, the whole field fades out
            let fade = revealedAt.map { max(0, 1 - now.timeIntervalSince($0) / Theme.Animation.spoilerNoiseFadeSeconds) } ?? 1

            Canvas { context, size in
                guard fade > 0, size.width > 0, size.height > 0 else { return }
                let count = min(700, Int(Theme.Animation.spoilerDensity * size.width * size.height))
                for index in 0..<count {
                    Particle(index: index).draw(in: &context, size: size, time: time, fade: fade)
                }
            }
        }
    }
}

private struct Particle {
    let index: Int

    func draw(in context: inout GraphicsContext, size: CGSize, time: TimeInterval, fade: Double) {
        var random = SeededRandom(seed: UInt64(index) &* 2_654_435_761 &+ 1)
        let lifetime = random.next(in: 0.3...1.5)
        let respawn = random.next(in: 0...1)
        let phase = random.next(in: 0...(lifetime + respawn))
        let cycleLength = lifetime + respawn

        let elapsed = time + phase
        let cycle = floor(elapsed / cycleLength)
        let t = elapsed - cycle * cycleLength
        guard t < lifetime else { return } // waiting to respawn

        // each life starts somewhere new
        var life = SeededRandom(seed: UInt64(index) &* 40_503 &+ UInt64(max(0, cycle)) &* 2_246_822_519 &+ 7)
        let x0 = life.next(in: 0...1) * size.width
        let y0 = life.next(in: 0...1) * size.height
        let speed = life.next(in: 4...14)
        let angle = life.next(in: 0...(2 * .pi))
        let baseSize = life.next(in: 1.0...1.5)
        let lightness = 1 - life.next(in: 0...0.3)
        let square = life.next(in: 0...1) > 0.5

        // grow in over 0.15s, shrink away over the last 0.3s
        let visibility = min(1, t / 0.15, max(0, (lifetime - t) / 0.3))
        let particleSize = baseSize * visibility * fade
        let alpha = fade * (1 - t / lifetime)
        guard particleSize > 0.05, alpha > 0.01 else { return }

        // slowing slightly as it goes, and wrapping around the edges
        let distance = speed * t * (1 - 0.25 * t / lifetime)
        let x = (x0 + cos(angle) * distance).truncatingRemainder(dividingBy: size.width)
        let y = (y0 + sin(angle) * distance).truncatingRemainder(dividingBy: size.height)
        let rect = CGRect(
            x: (x < 0 ? x + size.width : x) - particleSize / 2,
            y: (y < 0 ? y + size.height : y) - particleSize / 2,
            width: particleSize,
            height: particleSize
        )
        // the theme's particle color (white), dimmed up to 30% like the painter's lightness spread
        context.opacity = alpha
        context.fill(
            square ? Path(rect) : Path(ellipseIn: rect),
            with: .color(Theme.Colors.spoilerParticle.mix(with: .black, by: 1 - lightness))
        )
        context.opacity = 1
    }
}

/// A small repeatable random sequence, so a particle keeps its path from frame to frame
private struct SeededRandom {
    private var state: UInt64

    init(seed: UInt64) { state = seed == 0 ? 0x9E37_79B9_7F4A_7C15 : seed }

    mutating func next() -> Double {
        state ^= state << 13
        state ^= state >> 7
        state ^= state << 17
        return Double(state >> 11) / Double(1 << 53)
    }

    mutating func next(in range: ClosedRange<Double>) -> Double {
        range.lowerBound + next() * (range.upperBound - range.lowerBound)
    }
}
