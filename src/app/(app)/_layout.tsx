/**
 * (app)/_layout.tsx
 *
 * Bottom tabs for signed-in players: Profile and Leaderboard (the website's two
 * header NavLinks). Each tab draws the website's logo header itself.
 *
 * NativeTabs render the platform's own tab bar. Tabs stay mounted when you
 * switch away, so returning to one is instant.
 * Icons: `sf` = SF Symbol (iOS), `md` = Material icon (Android).
 */
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { colors } from "@/lib/theme";
import { copy } from "@/lib/copy";

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={colors.background}
      labelStyle={{ selected: { color: colors.text } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{copy.nav.profile}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.fill" md="person" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="leaderboard">
        <NativeTabs.Trigger.Label>{copy.nav.leaderboard}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="trophy.fill" md="leaderboard" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
