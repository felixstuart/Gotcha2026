import * as admin from "firebase-admin";
import { type Profile } from "./types";

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
      firstName: "Alex",
      lastName: "Chen",
      class: "senior",
      dayorboard: "board",
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
      firstName: "Jordan",
      lastName: "Lee",
      class: "sophomore",
      dayorboard: "day",
      tags: 0,
      chaser: "alex_chen@milton.edu",
      target: {
        firstName: "Felix",
        lastName: "Stuart",
        email: "felix_stuart27@milton.edu",
      },
      location: "Stu",
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

  process.exit(0);
}

seedProfiles().catch((err) => {
  console.error("❌ Error seeding profiles:", err);
  process.exit(1);
});
