const DEFAULT_AUTH_DOMAIN = "felixs-gotcha-tes.firebaseapp.com";
const APP_AUTH_DOMAINS = new Set(["gotchama.xyz", "gotchama.web.app"]);

/** Google must authorize /__/auth/handler on both app hosts before enabling. */
export function selectAuthDomain(hostname: string, sameOriginEnabled: boolean): string {
  return sameOriginEnabled && APP_AUTH_DOMAINS.has(hostname)
    ? hostname
    : DEFAULT_AUTH_DOMAIN;
}
