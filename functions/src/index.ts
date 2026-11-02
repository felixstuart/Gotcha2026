import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";

initializeApp();
setGlobalOptions({ maxInstances: 30 });

export { getProfile } from "./getProfile";
export { tagOut } from "./tagOut";
export { setLastWords } from "./setLastWords";
export { getLastWords } from "./getLastWords";
export { updateLeaderboard } from "./updateLeaderboard";
export { getLeaderboard } from "./getLeaderboard";
export { getAdminIndex } from "./getAdminIndex";
export { rebuildAdminIndex } from "./rebuildAdminIndex";
export { syncAdminIndex } from "./syncAdminIndex";
export { adminUpdateProfile } from "./adminUpdateProfile";
export { getAdminLog } from "./getAdminLog";
