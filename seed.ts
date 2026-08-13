import * as admin from "firebase-admin";
import { type Profile, type Leaderboard, type Role } from "./types";

// Initialize Firebase Admin SDK for emulator
admin.initializeApp({
  projectId: "felixs-gotcha-tes", // Use your project ID
});

// Connect to Firestore emulator
const db = admin.firestore();
db.settings({
  host: "localhost:8080", // Default Firestore emulator port
  ssl: false,
});

async function seedProfiles() {
  const profiles: Record<string, Profile> = {
    "felix_stuart27@milton.edu": {
      alive: true,
      role: "player",
      firstName: "Felix",
      lastName: "Stuart",
      class: "junior",
      dayorboard: "day",
      tags: 0,
      chaser: "jordan_lee@milton.edu",
      target: {
        firstName: "Alex",
        lastName: "Chen",
        email: "alex_chen@milton.edu",
      },
      location: "Strauss",
    },
    "alex_chen@milton.edu": {
      alive: true,
      role: "player",
      firstName: "Alex",
      lastName: "Chen",
      class: "senior",
      dayorboard: "wolcott",
      tags: 0,
      chaser: "felix_stuart27@milton.edu",
      target: {
        firstName: "Jordan",
        lastName: "Lee",
        email: "jordan_lee@milton.edu",
      },
      location: "Pritzker",
    },
    "jordan_lee@milton.edu": {
      alive: true,
      role: "player",
      firstName: "Jordan",
      lastName: "Lee",
      class: "sophomore",
      dayorboard: "day",
      tags: 0,
      chaser: "alex_chen@milton.edu",
      target: {
        firstName: "Isaac",
        lastName: "Wu",
        email: "isaac_wu28@milton.edu",
      },
      location: "Stu",
    },
    "isaac_wu28@milton.edu": {
      alive: true,
      role: "admin",
      firstName: "Isaac",
      lastName: "Wu",
      class: "junior",
      dayorboard: "day",
      tags: 0,
      chaser: "jordan_lee@milton.edu",
      target: {
        firstName: "Aarav",
        lastName: "Agrawal",
        email: "aarav_agrawal27@milton.edu",
      },
      location: "FMC",
    },
    "aarav_agrawal27@milton.edu": {
      alive: true,
      role: "player",
      firstName: "Aarav",
      lastName: "Agrawal",
      class: "senior",
      dayorboard: "day",
      tags: 0,
      chaser: "isaac_wu28@milton.edu",
      target: {
        firstName: "Felix",
        lastName: "Stuart",
        email: "felix_stuart27@milton.edu",
      },
      location: "Robotics lab",
    },
  };

  console.log("🔥 Connected to Firestore Emulator on localhost:8080");
  console.log("📝 Seeding profiles...");

  const batch = db.batch();

  for (const [email, profile] of Object.entries(profiles)) {
    const ref = db.collection("data").doc(email);
    batch.set(ref, profile);
  }

  await batch.commit();
  console.log("✅ Seeded 3 linked profiles successfully");

  // Verify the data was written
  const snapshot = await db.collection("data").get();
  console.log(`📊 Total profiles in emulator: ${snapshot.size}`);
}

async function seedLeaderboard() {
  console.log("📝 Seeding leaderboard and 10 new users...");
  const batch = db.batch();

  const users = [
    {
      firstName: "Alice",
      lastName: "Smith",
      role: "player" as Role,
      location: "Library",
      tags: 10,
      class: "senior",
      dayorboard: "wolcott",
    },
    {
      firstName: "Bob",
      lastName: "Jones",
      role: "player" as Role,
      location: "Dining Hall",
      tags: 9,
      class: "junior",
      dayorboard: "robbins",
    },
    {
      firstName: "Charlie",
      lastName: "Brown",
      role: "player" as Role,
      location: "Gym",
      tags: 8,
      class: "sophomore",
      dayorboard: "forbes",
    },
    {
      firstName: "David",
      lastName: "Wilson",
      role: "player" as Role,
      location: "Science Center",
      tags: 7,
      class: "freshman",
      dayorboard: "goodwin",
    },
    {
      firstName: "Eva",
      lastName: "Davis",
      role: "player" as Role,
      location: "Art Center",
      tags: 6,
      class: "senior",
      dayorboard: "hallowell",
    },
    {
      firstName: "Frank",
      lastName: "Miller",
      role: "player" as Role,
      location: "Student Center",
      tags: 5,
      class: "junior",
      dayorboard: "norris",
    },
    {
      firstName: "Grace",
      lastName: "Taylor",
      role: "player" as Role,
      location: "Chapel",
      tags: 4,
      class: "sophomore",
      dayorboard: "millet",
    },
    {
      firstName: "Henry",
      lastName: "Anderson",
      role: "player" as Role,
      location: "Field House",
      tags: 3,
      class: "freshman",
      dayorboard: "wolcott",
    },
    {
      firstName: "Ivy",
      lastName: "Thomas",
      role: "player" as Role,
      location: "Dorm",
      tags: 2,
      class: "senior",
      dayorboard: "robbins",
    },
    {
      firstName: "Jack",
      lastName: "White",
      role: "player" as Role,
      location: "Classroom",
      tags: 1,
      class: "junior",
      dayorboard: "forbes",
    },
  ];

  const profiles: Profile[] = users.map((user, index) => {
    const nextIndex = (index + 1) % users.length;
    const prevIndex = (index - 1 + users.length) % users.length;
    const targetUser = users[nextIndex];
    const chaserUser = users[prevIndex];

    return {
      alive: true,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      class: user.class,
      dayorboard: user.dayorboard,
      tags: user.tags,
      location: user.location,
      chaser: `${chaserUser.firstName.toLowerCase()}_${chaserUser.lastName.toLowerCase()}@milton.edu`,
      target: {
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        email: `${targetUser.firstName.toLowerCase()}_${targetUser.lastName.toLowerCase()}@milton.edu`,
        location: targetUser.location,
      },
    };
  });

  // Add profiles to batch
  profiles.forEach((p) => {
    const email = `${p.firstName.toLowerCase()}_${p.lastName.toLowerCase()}@milton.edu`;
    const ref = db.collection("data").doc(email);
    batch.set(ref, p);
  });

  const leaderboardRef = db.doc("leaderboard/main");

  const leaderboardData: Leaderboard = {
    topTaggers: profiles.map((p) => ({
      name: `${p.firstName} ${p.lastName}`,
      tags: p.tags,
    })),
    byDorms: [
      { dorm: "wolcott", tags: 13 },
      { dorm: "robbins", tags: 11 },
      { dorm: "forbes", tags: 9 },
      { dorm: "goodwin", tags: 7 },
      { dorm: "hallowell", tags: 6 },
      { dorm: "norris", tags: 5 },
      { dorm: "millet", tags: 4 },
    ],
    byClass: [
      { class: "senior", tags: 18 },
      { class: "junior", tags: 15 },
      { class: "sophomore", tags: 12 },
      { class: "freshman", tags: 10 },
    ],
    lastUpdated: Date.now(),
  };

  batch.set(leaderboardRef, leaderboardData);
  await batch.commit();
  console.log("✅ Seeded leaderboard and 10 users successfully");
}

Promise.all([seedProfiles(), seedLeaderboard()])
  .then(() => {
    console.log("✨ All seeding completed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error seeding:", err);
    process.exit(1);
  });
