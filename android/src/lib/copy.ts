/**
 * copy.ts
 *
 * Every player-facing string comes from `src/generated/copy.ts` (generated from
 * `shared/copy.json` in the Gotcha2026 repo). This file only adds a helper to
 * fill in the `{placeholders}` those strings use.
 */
export { copy } from "@/generated/copy";

/** fill("check in · {where} by {deadline}", { where: "AMC", deadline: "8:00 PM" }) */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
