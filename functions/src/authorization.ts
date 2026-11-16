import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase";
import { Profile } from "../../types";

const SCHOOL_EMAIL = /^[^/\s@]+@milton\.edu$/;

/**
 * TEMPORARY (added 2026-11-12): non-school Google accounts allowed to sign in, for App Store
 * review. Apple's reviewers can't use a @milton.edu account, so they get this one, with an
 * `observer` profile in data/ (not in the tag chain). Exact, lowercase matches only.
 * Admin checks (requireAdmin) stay school-only, so these accounts can never be admins.
 * To remove: delete the entry, redeploy functions, and delete its data/{email} profile.
 */
export const REVIEW_EMAILS: ReadonlySet<string> = new Set(["testforgotcha123@gmail.com"]);

/** A @milton.edu address, or one of the temporary review accounts */
export function isAllowedMemberEmail(email: string): boolean {
  return SCHOOL_EMAIL.test(email) || REVIEW_EMAILS.has(email);
}

export async function requireRegisteredSchoolUser(request: CallableRequest) {
  const email = request.auth?.token.email;
  if (!request.auth || typeof email !== "string" ||
      request.auth.token.email_verified !== true ||
      !isAllowedMemberEmail(email)) {
    throw new HttpsError("permission-denied", "A verified school account is required");
  }
  const snap = await db.collection("data").doc(email).get();
  const profile = snap.data() as Profile | undefined;
  if (!profile || !["player", "admin", "observer"].includes(profile.role)) {
    throw new HttpsError("permission-denied", "Gotcha membership is required");
  }
  return { email, profile };
}

/**
 * Whose data a call is about: the caller's own, or (admins only) the email in the request.
 * isAdmin comes from the caller's roster role (the profile requireRegisteredSchoolUser returns).
 */
export function requestedEmail(data: unknown, callerEmail: string, isAdmin: boolean): string {
  const email = (data as { email?: unknown } | null)?.email;
  if (email === undefined || email === null || email === "") return callerEmail;
  if (typeof email !== "string" || !isAllowedMemberEmail(email)) {
    throw new HttpsError("invalid-argument", "Invalid school email");
  }
  if (email !== callerEmail && !isAdmin) {
    throw new HttpsError("permission-denied", "Admin access is required");
  }
  return email;
}
