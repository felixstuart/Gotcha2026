/**
 * CheckInBadge.tsx
 *
 * Daily check-in UI, ported from `website/components/CheckInBadge.tsx`.
 * Deliberately still: no animation, just shape and color. Before check-in things
 * are drawn with dashed, open outlines; once checked in, the identity card gets a
 * solid ring (CHECKED_IN_RING) and a blue check sits next to the player's name.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { colors, fontSize, radius } from "@/lib/theme";
import { copy } from "@/lib/copy";

/** The style for the identity card once the player has checked in today. */
export const CHECKED_IN_RING = { borderWidth: 2, borderColor: colors.checkedInRing } as const;

// a scalloped badge: a disc ringed by 12 overlapping bumps, all one fill
const BUMPS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  return { cx: 12 + Math.cos(angle) * 8.2, cy: 12 + Math.sin(angle) * 8.2 };
});

const TOOLTIP_WIDTH = 224; // max-w-56

/**
 * The blue check mark after a player's name once they've checked in today.
 * Tapping it toggles a tooltip explaining what it means.
 */
export function VerifiedCheck({ size, tooltip }: { size: number; tooltip: string }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ width: size, height: size }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={copy.checkIn.checkedIn}
        accessibilityHint={tooltip}
        accessibilityState={{ expanded: open }}
        hitSlop={10}
      >
        <Svg viewBox="0 0 24 24" width={size} height={size}>
          <G fill={colors.verified}>
            <Circle cx="12" cy="12" r="8.4" />
            {BUMPS.map((b, i) => (
              <Circle key={i} cx={b.cx} cy={b.cy} r="2.7" />
            ))}
          </G>
          <Path
            d="M7.6 12.3l3 3 5.8-6.4"
            fill="none"
            stroke="white"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
      {open ? (
        <View
          pointerEvents="none"
          style={[styles.tooltipAnchor, { bottom: size + 8, left: size / 2 - TOOLTIP_WIDTH / 2 }]}
        >
          <View style={styles.tooltip} accessibilityRole="text">
            <Text style={styles.tooltipText}>{tooltip}</Text>
          </View>
          <View style={styles.arrow} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The "check in" button, shown until they've checked in today. Tapping it checks
 * in (by sharing their location). Once they have, it's replaced by the
 * VerifiedCheck and the card ring, so this renders nothing.
 */
export function CheckInBadge({
  checkedIn,
  label,
  locating,
  hint,
  onCheckIn,
}: {
  checkedIn: boolean;
  label: string; // copy.checkIn.prompt, filled in
  locating: boolean;
  hint?: string | null;
  onCheckIn: () => void;
}) {
  if (checkedIn) return null;
  const text = locating ? copy.checkIn.locating : label;

  return (
    <View style={styles.column}>
      <Pressable
        onPress={onCheckIn}
        disabled={locating}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityState={{ busy: locating, disabled: locating }}
        style={({ pressed }) => [
          styles.pill,
          pressed && styles.pillPressed,
          locating && styles.disabled,
        ]}
      >
        {/* an open, dashed ring: the empty spot the check will fill */}
        <Svg viewBox="0 0 24 24" width={16} height={16}>
          <Circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke={colors.checkInText}
            strokeWidth="2"
            strokeDasharray="3 3"
          />
        </Svg>
        <Text style={styles.pillText}>{text}</Text>
      </Pressable>
      {hint && !locating ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: "center", gap: 4, paddingTop: 4 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.checkInBorder,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  pillPressed: { borderColor: colors.verified },
  disabled: { opacity: 0.7 },
  pillText: { color: colors.checkInText, fontSize: fontSize.small, fontWeight: "500" },
  hint: { color: colors.textMuted, fontSize: fontSize.caption, textAlign: "center" },
  tooltipAnchor: {
    position: "absolute",
    width: TOOLTIP_WIDTH,
    alignItems: "center",
    zIndex: 20,
    elevation: 20,
  },
  tooltip: {
    maxWidth: TOOLTIP_WIDTH,
    backgroundColor: colors.tooltipBackground,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: `${colors.verified}66`, // 40%
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tooltipText: { color: colors.tooltipText, fontSize: fontSize.caption, lineHeight: 17 },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.tooltipBackground,
  },
});
