# Gotcha 2026

This is the repo that contains all the cloud functions and client code for Gotcha. That's the website, the cloud functions, and the iOS and Android apps. 

Cloud Functions are a new addition to the architecture this year. More information about why they were chosen can be found in the `functions/Why Cloud Functions.md` file, but this architecture was chosen to reduce database writes

## Structure 

`/website` houses the website. The website uses React Router v7 (in Framework mode) with Firebase Hosting as a deployment target. 
`/functions` contains the cloud functions in the `index.ts` file. 
`/ios` is the SwiftUI iPhone app (started by a club member in apopper29/Gotcha2026, whose history is kept here) and `/android` is the React Native (Expo) Android app.
`/shared` holds what the apps share with the backend: the callable functions and their request/response types (`callables.ts`, `callables.json`), the design tokens (`theme.json`) and the player-facing text (`copy.json`).

## Native apps

The apps never hand-write their models, function names, building names, colors or text. They're generated from `types.ts`, `shared/` and `geofence/buildings.geojson`:

```sh
npm run gen:clients     # writes ios/Gotcha/Generated/*.swift and android/src/generated/*.ts
npm run check:clients   # fails if those files are out of date
```

Run `gen:clients` after changing any of those sources and commit the generated files along with the change, so a backend type change and both apps' updates land in the same commit. The generated files are committed (rather than built on the fly) so Xcode and Expo builds don't need a Node step.

- **iOS:** open `ios/Gotcha.xcodeproj` and add `GoogleService-Info.plist` to `ios/Gotcha/` (it's gitignored). Debug builds use the Auth and Functions emulators on 127.0.0.1, and the sign-in screen has an emulator field that signs in as any roster email. `GotchaUITests` runs the whole player flow against the emulators; see the comments at the top of `GotchaFlowTests.swift` for setup.
- **Android:** see `android/README.md`. It needs `google-services.json` for package `edu.milton.gotcha`.

## Getting Started

To run Gotcha on your computer, you will need the Firebase packages and the Firebase emulator packages. Most packages can be installed with `npm`. There is a seeding script that will attach to the Firestore emulator and seed two dummy profiles and a third; currently, the third profile is set to me (felix_stuart27@milton.edu) but feel free to change it to whatever you please.

To run the seed script, run `npx tsx seed.ts` from the root of the project. It will create 12 profiles: 10 for the leaderboard, and two as a target and chaser for you. 

You can start emulators with the `firebase emulators:start` command. The emulators are essential for local development---none of the cloud functions are deployed. 

This codebase makes heavy use of TypeScript. I'd highly recommend reading up at least a little bit on what it is and how it works because it can be a pain sometimes, and while IDEs have excellent support for it, their suggestions can sometimes lead you down the wrong path. 

Full command list:
1. `npm install` in the root directory, `functions/`, and `website/` (installs dependencies)
2. `firebase login` if you haven't already
3. `npm run build` in `functions/` (you will need to rebuild the functions each time you update them because they need to be converted from Typescript to Javascript)
4. `firebase emulators:start` in the root directory
5. `npx tsx seed.ts` from the project root
6. `npm run dev` in `website/`

Btw, if you wanna test out the admin panel, make your self an admin in `seed.ts`, run `npx tsx seed.ts` from the project root, and go to the `/app/admin` page.

## Load the initial player loop

Create a plain text file named **`initial emails`** (no extension) in the repository
root, with one `@milton.edu` address per line. Start from `initial emails.example`.
The real roster is ignored by Git. Blank lines and `#` comments are allowed;
addresses are lowercased and duplicates are combined.

From the root, preview the input without connecting to Firebase:

```sh
npm run load:people -- --dry-run
```

For local simulation, start the emulators (after building functions), then load:

```sh
firebase emulators:start --project felixs-gotcha-tes --only auth,firestore,functions
# In another terminal, from the repository root:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run load:people -- --project felixs-gotcha-tes
```

This shuffles the players into **one closed target/chaser loop**, creates alive
player profiles with zero tags, and initializes `leaderboard/main`. The import
is atomic and supports 2–499 unique players. It refuses to change an existing
game (profiles, leaderboard, or last words); use a fresh emulator instance for
another simulation. Use this instead of `seed.ts` for an email-based roster.

Names are inferred from `first_lastYY@milton.edu`. Classes are inferred from the
graduation-year suffix; `--senior-year 2027` overrides the current school-year
default. Dorms and unrecognized classes are `unknown` and should be filled in
before the real game. Every imported member has the `player` role. Add
`--keep-order` for a repeatable loop in file order, or `--file "initial emails.txt"`
for another file name. Run `npm run load:people -- --help` for all options.

For a real initial import, with Application Default Credentials configured for
the intended project and `FIRESTORE_EMULATOR_HOST` unset:

```sh
npm run load:people -- --production --project YOUR_PROJECT_ID
```

The command creates membership profiles, not Firebase Auth accounts. Players
sign in using their verified school Google accounts. In website development
mode, Auth and Functions both connect to local emulators; use the Auth emulator's
Google sign-in screen to simulate a roster member. Run `npm run test:import` to
check roster validation and loop integrity.

## Security checks

From `functions/`, run `npm run test:security:unit` for fast checks or
`npm run test:security:emulator` to exercise actual Auth tokens, callable HTTP
endpoints, Firestore rules, and concurrent transactions. The emulator suite uses
only the `demo-gotcha-security` project and separate ports from local development
(`firebase.security.json`). It requires Java and the Firebase CLI; the CLI may
download the Firestore emulator on first use. It starts and stops its own
emulators and refuses to seed unless the Auth and Firestore hosts are local.
