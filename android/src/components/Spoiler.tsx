/**
 * Spoiler.tsx
 *
 * Hides text under a field of tiny drifting particles until it's revealed: the
 * app's version of the `spoiled` library's <Spoiler theme="dark"> that the website
 * puts over the target's building ("share to see"). The particle model follows
 * spoiled's paint worklet:
 * - n ≈ density × width × height (capped at MAX_PARTICLES), 1–1.5 px, half squares
 *   and half circles, white with 0–30% darker lightness
 * - each lives 0.3–1.5 s then respawns after up to 1 s, appearing over 0.15 s and
 *   shrinking away over the last 0.3 s, its alpha falling over its life, drifting
 *   2–12 px/s in a random direction and wrapping at the edges
 * - time advances in 24 fps steps
 * Hidden, the real text keeps its layout but is invisible. On reveal the particles
 * fade out one after another over 1.5 s and the text fades in over 0.3 s.
 *
 * Everything runs on the UI thread: one frame-callback clock, and one animated
 * style per particle computed from it. With Reduce Motion on, the particles stand
 * still and the reveal is a plain fade.
 */
import { useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type TextStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { animation, colors } from "@/lib/theme";

const MAX_PARTICLES = 150;
const STEP = 1 / animation.spoilerFPS;
const NOISE_FADE = animation.spoilerNoiseFadeSeconds;

type Particle = {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  size0: number;
  circle: boolean;
  lifetime: number;
  respawn: number;
  phase: number;
  color: string;
};

function makeParticles(width: number, height: number): Particle[] {
  const n = Math.round(Math.min(MAX_PARTICLES, animation.spoilerDensity * width * height));
  // spoiler's particle color is white; vary lightness 0–30% darker
  const base = parseInt(colors.spoilerParticle.slice(1, 3), 16);
  return Array.from({ length: n }, () => {
    const speed = 2 + Math.random() * 10;
    const angle = Math.random() * Math.PI * 2;
    const lifetime = 0.3 + Math.random() * 1.2;
    const respawn = Math.random();
    const v = Math.round(base * (1 - Math.random() * 0.3));
    return {
      x0: Math.random() * width,
      y0: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size0: 1 + Math.random() * 0.5,
      circle: Math.random() > 0.5,
      lifetime,
      respawn,
      phase: Math.random() * (lifetime + respawn),
      color: `rgb(${v},${v},${v})`,
    };
  });
}

type Props = {
  text: string;
  hidden: boolean;
  style?: TextStyle;
  /** Read out instead of the text while it's hidden. */
  hiddenLabel?: string;
};

export function Spoiler({ text, hidden, style, hiddenLabel = "Hidden" }: Props) {
  const reduceMotion = useReducedMotion();
  const [particles, setParticles] = useState<Particle[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // particles stay mounted until their fade-out after a reveal has finished
  const [fadedOut, setFadedOut] = useState(!hidden);
  const [prevHidden, setPrevHidden] = useState(hidden);
  if (hidden !== prevHidden) {
    setPrevHidden(hidden);
    setFadedOut(false);
  }
  const noiseOn = hidden || !fadedOut;

  const clock = useSharedValue(0.7); // seconds, in 24 fps steps
  const stopAt = useSharedValue(hidden ? Infinity : -Infinity); // when the reveal started
  const textOpacity = useSharedValue(hidden ? 0 : 1);

  useFrameCallback((frame) => {
    const t = (frame.timeSinceFirstFrame ?? 0) / 1000;
    const stepped = Math.floor(t / STEP) * STEP;
    if (stepped !== clock.value) clock.value = stepped;
  }, noiseOn && !reduceMotion);

  useEffect(() => {
    if (hidden) {
      stopAt.value = Infinity;
      textOpacity.value = withTiming(0, { duration: animation.spoilerHideSeconds * 1000 });
      return;
    }
    stopAt.value = clock.value;
    textOpacity.value = withTiming(1, {
      duration: animation.spoilerRevealSeconds * 1000,
      easing: Easing.out(Easing.ease),
    });
    const id = setTimeout(() => setFadedOut(true), reduceMotion ? 0 : NOISE_FADE * 1000);
    return () => clearTimeout(id);
  }, [hidden, reduceMotion, clock, stopAt, textOpacity]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.width) < 1 && Math.abs(height - size.height) < 1) return;
    setSize({ width, height });
    setParticles(makeParticles(width, height));
  };

  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  return (
    <View accessible accessibilityLabel={hidden ? hiddenLabel : text} onLayout={onLayout}>
      <Animated.Text style={[style, textStyle]}>{text}</Animated.Text>
      {noiseOn ? (
        <View style={styles.field} pointerEvents="none">
          {particles.map((p, i) => (
            <Speck
              key={i}
              p={p}
              index={i}
              count={particles.length}
              width={size.width}
              height={size.height}
              clock={clock}
              stopAt={stopAt}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Speck({
  p,
  index,
  count,
  width,
  height,
  clock,
  stopAt,
  reduceMotion,
}: {
  p: Particle;
  index: number;
  count: number;
  width: number;
  height: number;
  clock: SharedValue<number>;
  stopAt: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const now = clock.value;
    const cycle = p.lifetime + p.respawn;
    const t = Math.min(p.lifetime, (now + p.phase) % cycle);

    // appear over 0.15 s, shrink away over the last 0.3 s (spoiled's trapezoidal wave)
    const s = Math.max(0.15, p.lifetime - 0.3);
    const visibility =
      t < 0.15 ? t / 0.15 : t > s ? Math.max(0, 1 - (t - s) / (p.lifetime - s)) : 1;

    // reveal: particles fade one after another, each over a third of the duration
    let fade = 1;
    if (stopAt.value !== Infinity) {
      if (reduceMotion) {
        fade = 0;
      } else {
        const start = stopAt.value + ((2 / 3) * NOISE_FADE * index) / count;
        const progress = Math.min(1, Math.max(0, (now - start) / ((1 / 3) * NOISE_FADE)));
        fade = 1 - progress * progress * progress; // easeOutCubic(1 - progress), as spoiled does
      }
    }

    const sizeNow = fade * p.size0 * visibility;
    const x = (((p.x0 + p.vx * t) % width) + width) % width;
    const y = (((p.y0 + p.vy * t) % height) + height) % height;

    return {
      opacity: fade * (1 - t / p.lifetime),
      width: sizeNow,
      height: sizeNow,
      borderRadius: p.circle ? sizeNow / 2 : 0,
      transform: [{ translateX: x - sizeNow / 2 }, { translateY: y - sizeNow / 2 }],
    };
  });

  return <Animated.View style={[styles.speck, { backgroundColor: p.color }, style]} />;
}

const styles = StyleSheet.create({
  field: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  speck: { position: "absolute", left: 0, top: 0 },
});
