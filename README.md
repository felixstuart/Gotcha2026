# Gotcha 2026

This is the repo that contains all the cloud functions and client code for Gotcha. Currently, only the website and cloud functions are up, but the iOS and Android clients are coming. 

Cloud Functions are a new addition to the architecture this year. More information about why they were chosen can be found in the `functions/Why Cloud Functions.md` file, but this architecture was chosen to reduce database writes

## Structure 

`/website` houses the website. The website uses React Router v7 (in Framework mode) with Firebase Hosting as a deployment target. 
`/functions` contains the cloud functions in the `index.ts` file. 

## Getting Started

To run Gotcha on your computer, you will need the Firebase packages and the Firebase emulator packages. Most packages can be installed with `npm`. There is a seeding script that will attach to the Firestore emulator and seed two dummy profiles and a third; currently, the third profile is set to me (felix_stuart27@milton.edu) but feel free to change it to whatever you please.

To run the seed script, run `npx tsx seed.ts` from the root of the project. It will create 12 profiles: 10 for the leaderboard, and two as a target and chaser for you. 

You can start emulators with the `firebase emulators:start` command. The emulators are essential for local development---none of the cloud functions are deployed. 

This codebase makes heavy use of TypeScript. I'd highly recommend reading up at least a little bit on what it is and how it works because it can be a pain sometimes, and while IDEs have excellent support for it, their suggestions can sometimes lead you down the wrong path. 

Full command list:
1. `npm install` in the root directory, `functions/`, and `website/` (installs dependencies)
2. `firebase login` if you haven't already
3. `npm run build` in `functions/`
4. `firebase emulators:start` in the root directory
5. `npx tsx seed.ts` from the project root
6. `npm run dev` in `website/`