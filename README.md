# Gotcha mobile (Expo)

The iOS/Android app for Gotcha. It's a port of `website/`, so it calls the same Cloud Functions in `functions/`. Its types, callable names, theme, copy and building names are in `src/generated/`, written by `npm run gen:clients` in the Gotcha2026 repo. Don't edit them here.

## One-time setup
1. **Firebase native config.** In the Firebase console, add an iOS app and an Android app with the ID `edu.milton.gotcha`. Download these two files into this folder (both are gitignored):
   - `GoogleService-Info.plist` (iOS)
   - `google-services.json` (Android)
2. **Google Sign-In client ID.** In `src/lib/firebase.ts`, set `WEB_CLIENT_ID`. Find it under Authentication → Sign-in method → Google → Web SDK configuration.
3. **Xcode (iOS).** Install Xcode and point the command-line tools at it:
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

## Running
Start these from the repo root:
- `firebase emulators:start`
- `npx tsx seed.ts`

Then run this from this folder:
- `npx expo run:ios`
  - or `npx expo run:android`

This builds a custom dev client, which is required because Expo Go can't load the native Firebase modules. In dev builds the app uses the Auth emulator (9099) and Functions emulator (5001) at `10.0.2.2` on Android, `localhost` on iOS (see `src/lib/firebase.ts`).

## Layout
| Path | What it is |
|---|---|
| `src/app/_layout.tsx` | Root: auth gate (signed in → tabs, signed out → sign-in) |
| `src/app/sign-in.tsx` | Google sign-in (website `landing.tsx`) |
| `src/app/(app)/index.tsx` | Profile tab (website `profile.tsx`) |
| `src/app/(app)/leaderboard.tsx` | Leaderboard tab (website `leaderboard.tsx`) |
| `src/app/last-words.tsx` | Post-tag-out modal (website `last-words.tsx`) |
| `src/lib/api.ts` | Wrappers for every callable, typed by `generated/callables.ts` |
| `src/lib/cache.ts` | Disk-backed stale-while-revalidate cache (`expo-sqlite/kv-store`), per user, cleared on sign-out |
| `src/lib/firebase.ts` | Firebase/Google Sign-In setup, emulator wiring |
| `src/lib/location.ts` | One-shot foreground location (10 s timeout) |
| `src/lib/useAuth.tsx` | Auth context; rejects non-`@milton.edu` accounts |
| `src/components/` | `TagOutButton` (hold to confirm), `Spoiler`, `CheckInBadge` (+ `VerifiedCheck`), `LeaderboardCard`, shared `ui` pieces |
| `src/generated/` | Generated contract, theme, copy, buildings (do not edit) |
