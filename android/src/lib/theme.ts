/**
 * theme.ts
 *
 * Colors, radii, spacing, font sizes and animation timings, all from
 * `src/generated/theme.ts` (generated from `shared/theme.json` in the Gotcha2026
 * repo, which the iOS app uses too). Don't add hex values here: change
 * theme.json and run `npm run gen:clients` in the parent repo instead.
 *
 * The app is dark-only like the website (`userInterfaceStyle: "dark"` in app.json).
 */
import { theme } from "@/generated/theme";

export { theme };
export const colors = theme.colors;
export const radius = theme.radius;
export const spacing = theme.spacing;
export const fontSize = theme.fontSize;
export const animation = theme.animation;

/** The colored rank badge for a leaderboard position, same as the website. */
export function rankColor(position: number): string {
  if (position === 1) return colors.rankFirst;
  if (position === 2) return colors.rankSecond;
  if (position === 3) return colors.rankThird;
  return colors.rankOther;
}
