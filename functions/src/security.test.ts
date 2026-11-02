import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: { role: "player", alive: true } as Record<string, unknown> | undefined,
  txGet: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
}));
vi.mock("./firebase", () => ({ db: {
  collection: () => ({ doc: () => ({ get: async () => ({ data: () => state.profile }) }) }),
} }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => ({
  doc: (path: string) => ({ path }),
  runTransaction: (fn: (tx: unknown) => unknown) => fn({ get: state.txGet, update: state.update, set: state.set }),
}) }));
import { requireRegisteredSchoolUser, requestedEmail } from "./authorization";
import { tagOut } from "./tagOut";

const request = (email = "student@milton.edu", verified = true) => ({
  auth: { uid: "test", token: { email, email_verified: verified } }, data: {},
}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  state.profile = { role: "player", alive: true };
});

describe("student data authorization", () => {
  it("accepts verified registered school members", async () => {
    expect((await requireRegisteredSchoolUser(request())).email).toBe("student@milton.edu");
  });
  it.each([["outsider@gmail.com", true], ["student@milton.edu", false],
    ["student@milton.edu.evil.com", true]])("rejects %s (verified=%s)", async (email, verified) => {
    await expect(requireRegisteredSchoolUser(request(email, verified))).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("rejects school accounts without a registered profile", async () => {
    state.profile = undefined;
    await expect(requireRegisteredSchoolUser(request())).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("prevents students selecting another student's profile", () => {
    expect(() => requestedEmail({ email: "other@milton.edu" }, "student@milton.edu", "player"))
      .toThrow("Admin access is required");
    expect(requestedEmail({ email: "other@milton.edu" }, "admin@milton.edu", "admin"))
      .toBe("other@milton.edu");
  });
  it("rejects document-path injection even for admins", () => {
    expect(() => requestedEmail({ email: "a/b@milton.edu" }, "admin@milton.edu", "admin"))
      .toThrow("Invalid school email");
  });
});

it("rejects repeated tag-outs before any score or chain writes", async () => {
  state.txGet.mockResolvedValueOnce({ data: () => ({ alive: false, role: "player" }) });
  await expect(tagOut.run(request())).rejects.toMatchObject({ code: "failed-precondition" });
  expect(state.txGet).toHaveBeenCalledTimes(1);
  expect(state.update).not.toHaveBeenCalled();
  expect(state.set).not.toHaveBeenCalled();
});
