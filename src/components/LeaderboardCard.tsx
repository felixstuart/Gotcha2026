/**
 * LeaderboardCard.tsx
 *
 * One row of the "top taggers" list: a colored rank badge, the player's name,
 * and their tag count. Port of `website/components/LeaderboardCard.tsx`, plus a
 * highlight on the signed-in player's own row.
 */
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, rankColor, spacing } from "@/lib/theme";
import { copy } from "@/lib/copy";

type Props = {
  position: number; // 1-based
  name: string;
  tags: number;
  isYou?: boolean;
};

export function LeaderboardCard({ position, name, tags, isYou }: Props) {
  return (
    <View
      style={[styles.row, isYou && styles.you]}
      accessibilityLabel={`${position}. ${name}${isYou ? ` (${copy.leaderboard.you})` : ""}, ${tags} tags`}
    >
      <View style={[styles.badge, { backgroundColor: rankColor(position) }]}>
        <Text style={styles.badgeText}>{position}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name}
        {isYou ? <Text style={styles.youLabel}>{`  ${copy.leaderboard.you}`}</Text> : null}
      </Text>
      <Text style={styles.tags}>{tags}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stack,
    padding: spacing.card,
    borderRadius: radius.leaderboardCard,
    backgroundColor: colors.button,
    borderWidth: 2,
    borderColor: "transparent",
  },
  you: { borderColor: colors.youHighlight },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: colors.text },
  name: { flex: 1, color: colors.text, fontWeight: "bold" },
  youLabel: { color: colors.youHighlight, fontWeight: "normal", fontStyle: "italic" },
  tags: { color: colors.text },
});
