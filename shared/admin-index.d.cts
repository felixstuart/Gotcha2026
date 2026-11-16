import type { Profile, AdminIndexRow } from "../types";
export function toAdminIndexRow(profile: Partial<Profile> & Pick<Profile, "role">): AdminIndexRow;
