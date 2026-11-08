/**
 * sign-in.tsx
 *
 * The landing screen for signed-out players. Port of `website/app/routes/landing.tsx`:
 * a big "GOTCHA" wordmark, then a footer strip with the credit line and a
 * "Sign in with Google" button. (The website's fuzzy canvas wordmark has no
 * React Native equivalent, so this one is plain.)
 *
 * No redirect is needed after sign-in: once Firebase reports a user, the root
 * layout's <Stack.Protected> swaps this screen for the tabs.
 */
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isErrorWithCode, statusCodes } from "@react-native-google-signin/google-signin";
import { signInToEmulator, signInWithGoogle } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import { copy } from "@/lib/copy";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export default function SignIn() {
  const { error: authError } = useAuth(); // e.g. the @milton.edu message
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle(); // null if they closed the picker, which is fine
    } catch (e) {
      if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) return; // double tap
      console.error("Sign-in failed:", e);
      setError(copy.lastWords.unknown);
    } finally {
      setBusy(false);
    }
  };

  const message = error ?? authError;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Image
          source={require("@/assets/images/gotcha-logo.png")}
          style={styles.logo}
          accessibilityLabel="The Classic Gotcha Outstretched Hand"
        />
        <Text style={styles.wordmark} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
          {copy.landing.wordmark}
        </Text>
      </View>

      <View style={styles.footer}>
        {message ? <Text style={styles.error}>{message}</Text> : null}
        {__DEV__ ? <EmulatorSignIn onError={setError} /> : null}
        <Pressable
          onPress={handleSignIn}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy }}
          style={({ pressed }) => [
            styles.googleButton,
            pressed && { backgroundColor: colors.buttonPressed },
            busy && { opacity: 0.7 },
          ]}
        >
          <Image source={require("@/assets/images/google-logo.png")} style={styles.googleLogo} />
          <Text style={styles.googleText}>{copy.landing.signIn}</Text>
        </Pressable>
        <Text style={styles.caption}>{copy.landing.footer}</Text>
      </View>
    </SafeAreaView>
  );
}

/** Development builds talk to the Auth emulator, which can sign in as any roster email */
function EmulatorSignIn({ onError }: { onError: (message: string | null) => void }) {
  const [email, setEmail] = useState("");
  const signIn = async () => {
    onError(null);
    try {
      await signInToEmulator(email);
    } catch (e) {
      console.error("Emulator sign-in failed:", e);
      onError(copy.lastWords.unknown);
    }
  };
  return (
    <View style={styles.emulatorRow}>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Emulator: roster email"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={styles.emulatorInput}
        testID="emulatorEmail"
        onSubmitEditing={signIn}
      />
      <Pressable onPress={signIn} disabled={!email} testID="emulatorSignIn">
        <Text style={[styles.emulatorButton, !email && { opacity: 0.4 }]}>Sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  emulatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.list,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: spacing.row,
  },
  emulatorInput: { flex: 1, color: colors.text, fontSize: fontSize.small, paddingVertical: 10 },
  emulatorButton: { color: colors.text, fontSize: fontSize.small, fontWeight: "600" },
  screen: { flex: 1, backgroundColor: colors.background },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.stack,
    paddingHorizontal: spacing.card,
  },
  logo: { width: 96, height: 96 },
  wordmark: { color: colors.text, fontSize: fontSize.wordmark, fontWeight: "900" },
  footer: { padding: spacing.card, gap: spacing.stack },
  error: { color: colors.error, textAlign: "center" },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.list,
    backgroundColor: colors.button,
    borderRadius: radius.button,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  googleLogo: { width: 32, height: 32 },
  googleText: { color: colors.text, fontSize: fontSize.body },
  caption: { color: colors.textMuted, fontSize: fontSize.small, textAlign: "center" },
});
