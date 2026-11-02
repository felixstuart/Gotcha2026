import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { Role } from "../../types";

/**
 * Throws unless the caller's ID token has the `admin` custom claim.
 * Returns the admin's email.
 *
 * The claim is set by `syncRoleClaim` (called from getProfile), so a newly
 * promoted admin needs to load their profile once before this passes.
 */
export function requireAdmin(request: CallableRequest): string {
  const email = request.auth?.token.email;
  if (!request.auth || !email) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "User must be admin to access other user's data");
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
