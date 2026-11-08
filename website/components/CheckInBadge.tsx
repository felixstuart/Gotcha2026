import { useState } from "react";

// Daily check-in UI. Deliberately still: no animation, just shape and color.
// The language is open vs. closed. Before check-in things are drawn with dashed, open outlines
// (exposed). Once checked in, the player's card is fully enclosed by a solid ring in the same
// calm blue as the check by their name (covered for the day).

/** The ring around a player's card once they've checked in today (see the profile page) */
export const CHECKED_IN_RING = "ring-2 ring-sky-500/50";

// a scalloped badge: a disc ringed by 12 overlapping bumps, all one fill
const BUMPS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  return { cx: 12 + Math.cos(angle) * 8.2, cy: 12 + Math.sin(angle) * 8.2 };
});

/**
 * The blue check mark next to a player's name once they've checked in today.
 * Hovering, focusing or tapping it shows what it means (tapping matters on phones, which can't hover).
 */
export function VerifiedCheck({ tooltip }: { tooltip: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="group relative inline-flex align-middle ml-1.5">
      <button
        type="button"
        aria-label="Checked in"
        aria-describedby="checked-in-tooltip"
        className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        <svg viewBox="0 0 24 24" className="w-[0.85em] h-[0.85em]" aria-hidden>
          <g fill="#1d9bf0">
            <circle cx="12" cy="12" r="8.4" />
            {BUMPS.map((b, i) => (
              <circle key={i} cx={b.cx} cy={b.cy} r="2.7" />
            ))}
          </g>
          <path
            d="M7.6 12.3l3 3 5.8-6.4"
            fill="none"
            stroke="white"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span
        id="checked-in-tooltip"
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-56 -translate-x-1/2 rounded-md bg-slate-950 px-3 py-2 text-left text-xs font-normal leading-snug text-slate-200 shadow-lg ring-1 ring-sky-500/40 ${open ? "block" : "hidden group-hover:block group-focus-within:block"}`}
      >
        {tooltip}
        {/* the little arrow pointing down at the check */}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-950" />
      </span>
    </span>
  );
}

/**
 * The "check in" button, shown until they've checked in today. Tapping it checks in
 * (by sharing their location). Once they have, it's replaced by the VerifiedCheck and card ring.
 */
export function CheckInBadge({
  checkedIn,
  building,
  deadline,
  locating,
  hint,
  onCheckIn,
}: {
  checkedIn: boolean;
  building: string | null; // null means any building
  deadline: string; // e.g. "8:00 PM"
  locating: boolean;
  hint?: string | null; // e.g. "you're not in a building"
  onCheckIn: () => void;
}) {
  if (checkedIn) return null;

  return (
    <div className="flex flex-col items-center gap-1 pt-1">
      <button
        onClick={onCheckIn}
        disabled={locating}
        className="inline-flex items-center gap-2 rounded-full border border-dashed border-slate-400 px-4 py-1.5 text-sm font-medium text-slate-100 hover:border-sky-400 hover:text-white disabled:cursor-wait disabled:opacity-70"
      >
        {/* an open, dashed ring: the empty spot the check will fill */}
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
        </svg>
        {locating ? "Checking in…" : `Check in at ${building ?? "any building"} by ${deadline}`}
      </button>
      {hint && !locating && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}
