/**
 * TagOutButton.tsx
 *
 * Hold-to-confirm button, ported from `website/components/TagOut.tsx`.
 * Tagging out is permanent, so a tap isn't enough:
 *
 *   1. Press and hold: a rose bar fills the button over 2 s ("Hold to confirm").
 *   2. Once full: "Release to confirm", with a haptic tick.
 *   3. Release on the button while full: the bar sweeps off and `onConfirm` runs.
 *      Release early (or slide off): the bar rewinds in 0.2 s and nothing happens.
 *
 * Reanimated runs the fill on the UI thread, so it stays smooth while JS is busy.
 */
import { useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  FadeInUp,
  FadeOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { animation, colors, fontSize, radius } from "@/lib/theme";
import { copy } from "@/lib/copy";

type Props = {
  text: string;
  /** Runs after a full hold and release. A spinner shows while it runs. */
  onConfirm: () => Promise<void>;
};

type State = "idle" | "inProgress" | "complete";

function haptic(kind: "full" | "confirm") {
  if (Platform.OS === "android") {
    Haptics.performAndroidHapticsAsync(
      kind === "full" ? Haptics.AndroidHaptics.Long_Press : Haptics.AndroidHaptics.Confirm,
    ).catch(() => {});
  } else if (kind === "full") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
}

export function TagOutButton({ text, onConfirm }: Props) {
  const [state, setState] = useState<State>("idle");
  const [busy, setBusy] = useState(false);
  const confirming = useRef(false);

  // 0..1: how far the fill reaches from the left. `sweep` moves its left edge
  // off to the right when confirmed, like the website.
  const progress = useSharedValue(0);
  const sweep = useSharedValue(0);

  const fillStyle = useAnimatedStyle(() => ({
    left: `${sweep.value * 100}%`,
    right: `${(1 - progress.value) * 100}%`,
  }));

  const markComplete = () => {
    setState("complete");
    haptic("full");
  };

  const rewind = () => {
    cancelAnimation(progress);
    setState("idle");
    progress.value = withTiming(0, {
      duration: animation.tagOutRewindSeconds * 1000,
      easing: Easing.linear,
    });
  };

  const handlePressIn = () => {
    if (busy) return;
    confirming.current = false;
    setState("inProgress");
    progress.value = withTiming(
      1,
      { duration: animation.tagOutHoldSeconds * 1000, easing: Easing.linear },
      (finished) => {
        if (finished) scheduleOnRN(markComplete);
      },
    );
  };

  // Fires on every release. A release on the button while full also fires
  // onPress right after, so give it a moment before rewinding.
  const handlePressOut = () => {
    if (busy) return;
    if (state !== "complete") {
      rewind();
      return;
    }
    setTimeout(() => {
      if (!confirming.current) rewind();
    }, 50);
  };

  const handlePress = () => {
    if (busy || state !== "complete") return;
    confirming.current = true;
    haptic("confirm");
    sweep.value = withTiming(1, { duration: 200, easing: Easing.linear }, () => {
      scheduleOnRN(runConfirm);
    });
  };

  const runConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      sweep.value = 0;
      progress.value = 0;
      setBusy(false);
      setState("idle");
      confirming.current = false;
    }
  };

  const label =
    state === "idle"
      ? text
      : state === "inProgress"
        ? copy.profile.holdToConfirm
        : copy.profile.releaseToConfirm;

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={`Press and hold for ${animation.tagOutHoldSeconds} seconds, then release to confirm.`}
      style={({ pressed }) => [styles.button, pressed && state === "idle" && styles.pressed]}
    >
      <Animated.View style={[styles.fill, fillStyle]} pointerEvents="none" />
      <View style={styles.labelWrap}>
        {busy ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Animated.Text
            key={label}
            entering={FadeInUp.duration(150)}
            exiting={FadeOutDown.duration(150)}
            style={styles.label}
          >
            {label}
          </Animated.Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.button,
    borderRadius: radius.card,
    overflow: "hidden",
    paddingVertical: 48,
    width: "100%",
  },
  pressed: { backgroundColor: colors.background },
  fill: { position: "absolute", top: 0, bottom: 0, backgroundColor: colors.tagOutFill },
  labelWrap: { alignItems: "center", justifyContent: "center", minHeight: 32 },
  label: { color: colors.text, fontSize: fontSize.headline, fontWeight: "bold" },
});
