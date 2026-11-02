import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase";
import { Profile } from "../../types";

export async function requireRegisteredSchoolUser(request: CallableRequest) {
  const email = request.auth?.token.email;
  if (!request.auth || typeof email !== "string" ||
      request.auth.token.email_verified !== true ||
      !/^[^/\s@]+@milton\.edu$/.test(email)) {
    throw new HttpsError("permission-denied", "A verified school account is required");
  }
  const snap = await db.collection("data").doc(email).get();
  const profile = snap.data() as Profile | undefined;
  if (!profile || !["player", "admin", "observer"].includes(profile.role)) {
    throw new HttpsError("permission-denied", "Gotcha membership is required");
  }
  return { email, profile };
}

export function requestedEmail(data: unknown, callerEmail: string, role: string): string {
  const email = (data as { email?: unknown } | null)?.email;
  if (email === undefined || email === null || email === "") return callerEmail;
  if (typeof email !== "string" || !/^[^/\s@]+@milton\.edu$/.test(email)) {
    throw new HttpsError("invalid-argument", "Invalid school email");
  }
  if (email !== callerEmail && role !== "admin") {
    throw new HttpsError("permission-denied", "Admin access is required");
  }
  return email;
}
