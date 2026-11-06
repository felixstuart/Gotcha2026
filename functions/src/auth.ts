import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { Role } from "../../types";

/**
 * Who can play is decided by the roster (requireRegisteredSchoolUser in authorization.ts).
 * Who is an admin is decided by the `admin` custom claim on their ID token, which
 * syncRoleClaim keeps in step with the `role` in their roster profile.
 */

/** True if the caller's ID token has the `admin` custom claim */
export function hasAdminClaim(request: CallableRequest): boolean {
  return request.auth?.token.admin === true;
}

/**
 * Throws unless the caller is a verified school account with the `admin` claim.
 * Returns the admin's email. Needs no Firestore read, so admin-only functions stay cheap.
 *
 * The claim is set by `syncRoleClaim` (called from getProfile), so a newly
 * promoted admin needs to load their profile once before this passes.
 */
export function requireAdmin(request: CallableRequest): string {
  const email = request.auth?.token.email;
  if (!request.auth || typeof email !== "string" ||
      request.auth.token.email_verified !== true ||
      !/^[^/\s@]+@milton\.edu$/.test(email)) {
    throw new HttpsError("permission-denied", "A verified school account is required");
  }

  if (!hasAdminClaim(request)) {
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
