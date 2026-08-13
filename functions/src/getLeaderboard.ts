import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { Leaderboard } from "../../types";

export const getLeaderboard = onCall(async (request) => {
  if (!request.auth) {
    return null;
  }

  const db = getFirestore();

  const leaderboardDoc = db.doc("leaderboard/main");
  const leaderboardSnap = await leaderboardDoc.get();

  const leaderboard = leaderboardSnap.data() as unknown as Leaderboard;
  return { leaderboard };
});
