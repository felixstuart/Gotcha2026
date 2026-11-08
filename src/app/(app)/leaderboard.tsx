/**
 * (app)/leaderboard.tsx: Leaderboard tab
 *
 * Port of `website/app/routes/leaderboard.tsx` (stacked, as the website lays it
 * out on a phone):
 *   - a red countdown: "Starts in …" before the game, time left during it,
 *     "Gotcha is Over!" after (from the admin-set startsAt/endsAt)
 *   - Classes and Dorms columns
 *   - the ranked top taggers, with the signed-in player's row highlighted
 *
 * Data: leaderboard (60 s) and settings (5 min) through the disk cache.
 */
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as api from "@/lib/api";
import type { Profile } from "@/lib/api";
import { KEYS, useCached } from "@/lib/cache";
import { copy, fill } from "@/lib/copy";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { LeaderboardCard } from "@/components/LeaderboardCard";
import {
  AppHeader,
  ErrorView,
  GotchaLoader,
  Heading,
  OfflineNote,
  TabScreen,
} from "@/components/ui";

function formatDiff(diff: number) {
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000) % 24;
  const minutes = Math.floor(diff / 60_000) % 60;
  const seconds = Math.floor(diff / 1000) % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function countdownText(startsAt: number | null, endsAt: number | null) {
  const now = Date.now();
  if (startsAt !== null && now < startsAt) {
    return fill(copy.leaderboard.startsIn, { time: formatDiff(startsAt - now) });
  }
  if (endsAt === null) return ""; // nothing to count down to
  if (now >= endsAt) return copy.leaderboard.over;
  return formatDiff(endsAt - now);
}

/** Re-renders every second with the countdown text. */
function useCountdown(startsAt: number | null | undefined, endsAt: number | null | undefined) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (startsAt === undefined || endsAt === undefined) return "";
  return countdownText(startsAt, endsAt);
}

const noProfileFetch = async (): Promise<Profile | null> => null;

export default function LeaderboardScreen() {
  const board = useCached(KEYS.leaderboard, api.getLeaderboard);
  const settings = useCached(KEYS.settings, api.getGameSettings);
  // Only follows the cached profile (the Profile tab fetches it), to find "you".
  const me = useCached(KEYS.profile, noProfileFetch, false);
  const countdown = useCountdown(settings.data?.startsAt, settings.data?.endsAt);

  const refreshAll = () => {
    board.refresh();
    settings.refresh();
  };

  if (board.data === undefined) {
    return (
      <TabScreen>
        {board.error ? (
          <ErrorView message={api.errorMessage(board.error)} onRetry={refreshAll} />
        ) : (
          <GotchaLoader />
        )}
      </TabScreen>
    );
  }

  const lb = board.data;
  const myName = me.data ? `${me.data.firstName} ${me.data.lastName}` : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={board.refreshing}
            onRefresh={refreshAll}
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.card}
          />
        }
      >
        <AppHeader />
        <OfflineNote visible={!!board.error} />
        {countdown ? (
          <Text style={styles.countdown} accessibilityRole="timer">
            {countdown}
          </Text>
        ) : null}

        <View style={styles.columns}>
          <TotalsColumn
            title={copy.leaderboard.classes}
            rows={(lb?.byClass ?? []).map((c) => ({ label: c.class, tags: c.tags }))}
          />
          <TotalsColumn
            title={copy.leaderboard.dorms}
            rows={(lb?.byDorms ?? []).map((d) => ({ label: d.dorm, tags: d.tags }))}
          />
        </View>

        <View style={styles.list}>
          <Heading>{copy.leaderboard.title}</Heading>
          {(lb?.topTaggers ?? []).map(({ name, tags }, i) => (
            <LeaderboardCard
              key={i}
              position={i + 1}
              name={name}
              tags={tags}
              isYou={name === myName}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TotalsColumn({ title, rows }: { title: string; rows: { label: string; tags: number }[] }) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnTitle}>{title}</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.totalRow}>
          <Text style={styles.totalLabel} numberOfLines={1}>
            {capitalize(row.label)}
          </Text>
          <Text style={styles.totalTags}>{row.tags}</Text>
        </View>
      ))}
    </View>
  );
}

/** Like CSS `capitalize`: the first letter of every word. */
function capitalize(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.card, paddingTop: 0, gap: spacing.stack * 2 },
  countdown: {
    color: colors.countdown,
    fontSize: fontSize.countdown,
    fontWeight: "bold",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  columns: { flexDirection: "row", gap: spacing.stack * 2 },
  column: { flex: 1, gap: spacing.list },
  columnTitle: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: spacing.list,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.list,
    padding: spacing.row,
    borderRadius: radius.card,
    backgroundColor: colors.row,
  },
  totalLabel: { flexShrink: 1, color: colors.text, fontWeight: "500" },
  totalTags: { color: colors.text, fontWeight: "bold" },
  list: { gap: spacing.list },
});
