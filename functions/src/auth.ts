import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { Profile, Role } from "../../types";
import { db } from "./firebase";

/**
 * Who can play is decided by the roster (requireRegisteredSchoolUser in authorization.ts).
 * Who is an admin is decided by the `admin` custom claim on their ID token, which
 * syncRoleClaim keeps in step with the `role` in their roster profile.
 */

/**
 * True if the caller's ID token has the `admin` custom claim.
 * The claim can be out of date (see requireAdmin), so never use it on its own to allow something.
 */
export function hasAdminClaim(request: CallableRequest): boolean {
  return request.auth?.token.admin === true;
}

/**
 * Throws unless the caller is a verified school account whose roster profile says `admin`.
 * Returns the admin's email.
 *
 * The roster is the source of truth, so this reads the caller's profile (1 read) rather than
 * trusting the `admin` claim alone: a claim is only cleared when that user next loads their
 * own profile, so on its own it would let a demoted admin stay an admin for as long as they
 * avoided doing that. The claim is still required, so a newly promoted admin needs to load
 * their profile once (and refresh their token) before this passes.
 */
export async function requireAdmin(request: CallableRequest): Promise<string> {
  const email = request.auth?.token.email;
  if (!request.auth || typeof email !== "string" ||
      request.auth.token.email_verified !== true ||
      !/^[^/\s@]+@milton\.edu$/.test(email)) {
    throw new HttpsError("permission-denied", "A verified school account is required");
  }

  if (!hasAdminClaim(request)) {
    throw new HttpsError("permission-denied", "Admin access is required");
  }

  const profile = (await db.collection("data").doc(email).get()).data() as Profile | undefined;
  if (profile?.role !== "admin") {
    throw new HttpsError("permission-denied", "Admin access is required");
  }

  return email;
}

/**
 * Makes the caller's `admin` claim match the `role` in their profile doc,
 * which stays the source of truth.
 * Returns true if the claim changed, meaning the client has to refresh its
 * ID token (`getIdToken(true)`) before the change takes effect.
 */
export async function syncRoleClaim(request: CallableRequest, role: Role): Promise<boolean> {
  if (!request.auth) return false;

  const shouldBeAdmin = role === "admin";
  if ((request.auth.token.admin === true) === shouldBeAdmin) return false;

  const auth = getAuth();
  const user = await auth.getUser(request.auth.uid);
  // keep any other claims we might add later
  const { admin: _admin, ...otherClaims } = user.customClaims ?? {};
  await auth.setCustomUserClaims(
    request.auth.uid,
    shouldBeAdmin ? { ...otherClaims, admin: true } : otherClaims,
  );

  // note: a demoted admin's current ID token still says admin until it expires (<= 1 hour)
  return true;
}
