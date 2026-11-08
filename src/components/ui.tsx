/**
 * ui.tsx
 *
 * Small building blocks reused across screens:
 * - <Card>:        the slate panel the website uses everywhere (`bg-slate-800 p-4 rounded-lg`).
 * - <Heading>:     section title ("Profile", "Last Words", ...).
 * - <StatCard>:    a card with a label over a big value (Tags).
 * - <AppHeader>:   the logo + "Gotcha" header from the website's Layout.
 * - <GotchaLoader>: the pulsing "G" with rotating tips (website GotchaHand.tsx).
 * - <ErrorView>:   "Uh oh." + the message + retry (the website's ErrorBoundary).
 * - <OfflineNote>: shown when we're on saved data because a refresh failed.
 * - <Button>:      a plain slate button.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing, animation } from "@/lib/theme";
import { copy } from "@/lib/copy";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.heading} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </Card>
  );
}

/** The website's header: hand logo and "Gotcha". Navigation is the tab bar. */
export function AppHeader() {
  return (
    <View style={styles.header}>
      <Image
        source={require("@/assets/images/gotcha-logo.png")}
        style={styles.headerLogo}
        accessibilityLabel="The Classic Gotcha Outstretched Hand"
      />
      <Text style={styles.headerTitle}>{copy.appName}</Text>
    </View>
  );
}

/** A full screen with the app header, used by the loading and error states of the tabs. */
export function TabScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <AppHeader />
      {children}
    </SafeAreaView>
  );
}

/** Pulsing "G" and a loading tip that changes every 2 s, starting at a random one. */
export function GotchaLoader() {
  const tips = copy.loaderTips;
  const [index, setIndex] = useState(() => Math.floor(Math.random() * tips.length));
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    const id = setInterval(
      () => setIndex((i) => (i + 1) % tips.length),
      animation.loaderTipSeconds * 1000,
    );
    return () => clearInterval(id);
  }, [tips.length]);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withTiming(1, {
        duration: (animation.loaderPulseSeconds * 1000) / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [pulse, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.12 }],
    opacity: 0.9 + pulse.value * 0.1,
  }));

  return (
    <View style={styles.center} accessibilityLabel={tips[index]} accessibilityRole="progressbar">
      <Animated.View style={[styles.loaderCircle, pulseStyle]}>
        <Text style={styles.loaderG}>G</Text>
      </Animated.View>
      <Text style={styles.loaderTip}>{tips[index]}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>{copy.errors.title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry ? <Button title={copy.errors.retry} onPress={onRetry} /> : null}
    </View>
  );
}

/** A quiet line saying the screen shows saved data because the last refresh failed. */
export function OfflineNote({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <Text style={styles.offline}>{copy.errors.offline}</Text>;
}

export function Button({
  title,
  onPress,
  disabled,
  style,
  textStyle,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        pressed && { backgroundColor: colors.buttonPressed },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, textStyle]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.card,
    alignItems: "center",
    gap: spacing.list,
  },
  heading: { color: colors.text, fontSize: fontSize.title, fontWeight: "bold" },
  statLabel: { color: colors.text, fontSize: fontSize.title, fontWeight: "600" },
  statValue: {
    color: colors.text,
    fontSize: fontSize.headline,
    fontWeight: "bold",
    textAlign: "center",
  },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4 },
  headerLogo: { width: 64, height: 64 },
  headerTitle: { color: colors.text, fontSize: fontSize.headline, fontWeight: "bold" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.card,
    gap: spacing.stack,
    backgroundColor: colors.background,
  },
  loaderCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  loaderG: { color: colors.text, fontSize: fontSize.headline, fontWeight: "900" },
  loaderTip: { color: colors.text, fontSize: 18, fontWeight: "500" },
  errorTitle: {
    color: colors.text,
    fontSize: fontSize.error,
    fontWeight: "bold",
    textAlign: "center",
  },
  errorMessage: { color: colors.error, fontSize: fontSize.small, textAlign: "center" },
  offline: { color: colors.textMuted, fontSize: fontSize.caption, textAlign: "center" },
  button: {
    backgroundColor: colors.button,
    borderRadius: radius.button,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  buttonText: { color: colors.text, fontWeight: "bold", fontSize: fontSize.body },
});
