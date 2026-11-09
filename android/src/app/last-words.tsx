/**
 * last-words.tsx
 *
 * "Thanks for playing. Any last words?", shown right after a player tags
 * themselves out. Port of `website/app/routes/last-words.tsx`, with the same
 * error messages and 60-character limit. On success it goes to the Leaderboard.
 *
 * Opened as a full-screen modal from the Profile tab with `?canSubmit=1`.
 * Without it (e.g. a deep link) it goes straight to the leaderboard, like the
 * website's `state.canSubmit` check.
 *
 * Background: a light stand-in for the website's LetterGlitch canvas.
 */
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import * as api from "@/lib/api";
import { auth } from "@/lib/firebase";
import { copy } from "@/lib/copy";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export default function LastWordsScreen() {
  const { canSubmit } = useLocalSearchParams<{ canSubmit?: string }>();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (canSubmit !== "1") router.replace("/leaderboard");
  }, [canSubmit]);

  const goToLeaderboard = () => {
    router.dismissAll();
    router.replace("/leaderboard");
  };

  const handleSubmit = async () => {
    setError("");
    const lastWords = text.trim();
    if (!lastWords) {
      setError(copy.lastWords.empty);
      return;
    }
    if (!auth.currentUser?.email) {
      setError(copy.lastWords.notSignedIn);
      return;
    }

    setLoading(true);
    try {
      await api.setLastWords(lastWords);
      goToLeaderboard();
    } catch (e) {
      console.error("Error setting last words:", e);
      const code = api.errorCode(e);
      const msg = e instanceof Error ? e.message : "";
      if (code === "already-exists" || msg.includes("Last words already set")) {
        setError(copy.lastWords.alreadySubmitted);
      } else if (code === "unauthenticated") {
        setError(copy.lastWords.signInAgain);
      } else if (msg === "Failed to submit") {
        setError(copy.lastWords.failed);
      } else {
        setError(copy.lastWords.unknown);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Animated.View entering={FadeIn.duration(1000)} style={StyleSheet.absoluteFill}>
        <GlyphRain />
      </Animated.View>
      <View style={styles.center}>
        <Animated.View entering={FadeInDown.delay(500).duration(1000)} style={styles.box}>
          <View style={styles.titles}>
            <Text style={styles.title} accessibilityRole="header">
              {copy.lastWords.title}
            </Text>
            <Text style={styles.subtitle}>{copy.lastWords.prompt}</Text>
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            editable={!loading}
            maxLength={copy.lastWords.maxLength}
            placeholder={copy.lastWords.placeholder}
            placeholderTextColor={colors.textFaint}
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
            style={[styles.input, loading && { opacity: 0.5 }]}
            accessibilityLabel={copy.lastWords.prompt}
          />

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={copy.lastWords.submit}
            accessibilityState={{ busy: loading }}
            style={({ pressed }) => [
              styles.submit,
              pressed && { transform: [{ scale: 0.95 }], opacity: 0.85 },
              loading && { opacity: 0.5 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.lastWordsBackground} />
            ) : (
              <Text style={styles.submitText}>{copy.lastWords.submit}</Text>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789";
const GLYPH_COLORS = [colors.glitch1, colors.glitch2, colors.glitch3];
const ROWS = 28;
const COLS = 18;

function randomCell() {
  return {
    ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    color: GLYPH_COLORS[Math.floor(Math.random() * GLYPH_COLORS.length)],
  };
}

/** A dim grid of letters that slowly change, like the website's LetterGlitch. */
function GlyphRain() {
  const reduceMotion = useReducedMotion();
  const [grid, setGrid] = useState(() =>
    Array.from({ length: ROWS }, () => Array.from({ length: COLS }, randomCell)),
  );

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      setGrid((rows) =>
        rows.map((row) => row.map((cell) => (Math.random() < 0.05 ? randomCell() : cell))),
      );
    }, 120);
    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <View style={styles.glyphs} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {grid.map((row, r) => (
        <View key={r} style={styles.glyphRow}>
          {row.map((cell, c) => (
            <Text key={c} style={[styles.glyph, { color: cell.color }]}>
              {cell.ch}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.lastWordsBackground },
  glyphs: { flex: 1, justifyContent: "space-around", opacity: 0.35 },
  glyphRow: { flexDirection: "row", justifyContent: "space-around" },
  glyph: { fontSize: 14, fontFamily: Platform.OS === "android" ? "monospace" : "Menlo" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.card },
  box: {
    width: "100%",
    maxWidth: 448,
    padding: 32,
    gap: 32,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radius.card,
  },
  titles: { alignItems: "center", gap: spacing.list },
  title: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "bold",
    letterSpacing: -1,
    textAlign: "center",
  },
  subtitle: { color: colors.textMuted, fontSize: fontSize.small },
  input: {
    borderWidth: 2,
    borderColor: colors.ring,
    borderRadius: radius.card,
    paddingVertical: 12,
    color: colors.text,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    fontSize: fontSize.body,
  },
  error: {
    color: colors.error,
    fontSize: fontSize.small,
    textAlign: "center",
    padding: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
    backgroundColor: "rgba(239,68,68,0.1)",
    overflow: "hidden",
  },
  submit: {
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitText: { color: colors.lastWordsBackground, fontWeight: "bold", fontSize: fontSize.body },
});
