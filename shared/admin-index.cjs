// One projection shared by import, verification and Cloud Functions.
exports.toAdminIndexRow = (profile) => ({
  firstName: profile.firstName ?? "", lastName: profile.lastName ?? "",
  class: profile.class ?? "", dayorboard: profile.dayorboard ?? "",
  role: profile.role, alive: profile.alive ?? false, tags: profile.tags ?? 0,
  chaser: profile.chaser ?? "none", targetEmail: profile.target?.email ?? "",
  lastEditedBy: profile.lastEditedBy ?? null, lastEditedAt: profile.lastEditedAt ?? null,
  checkedInAt: profile.checkedInAt ?? null,
});
