import { HttpsError } from "firebase-functions/v2/https";
import { Firestore, Transaction } from "firebase-admin/firestore";
import { Profile } from "../../types";

// what a player with nobody to chase (an observer, or the winner) has as their target
const NO_TARGET: Profile["target"] = { firstName: "None", lastName: "", email: "" };

/**
 * The alive players form one loop: each player's `target` is the next player, and that
 * player's `chaser` points back. Every change to the loop has to update both sides,
 * so all chain edits (tag outs, admin moves, revives) go through this class.
 *
 * Use it inside a transaction: `load` the players you need, call the chain methods
 * (which only edit the loaded profiles in memory), then `save` once at the end.
 * Firestore needs every read in a transaction to happen before the first write,
 * which is why nothing is written until `save`.
 */
export class Chain {
  private profiles = new Map<string, Profile>();
  private touched = new Set<string>();

  constructor(private db: Firestore, private tx: Transaction) {}

  /** Reads a profile once per transaction. Later calls return the same (possibly edited) object */
  async load(email: string): Promise<Profile> {
    const loaded = this.profiles.get(email);
    if (loaded) return loaded;

    const snap = await this.tx.get(this.db.doc(`data/${email}`));
    if (!snap.exists) {
      throw new HttpsError("not-found", `No profile for ${email}`);
    }
    const profile = snap.data() as Profile;
    this.profiles.set(email, profile);
    return profile;
  }

  /** Marks a loaded profile as changed so `save` writes it */
  touch(email: string) {
    this.touched.add(email);
  }

  /** The emails and new data of every changed profile */
  changed(): Array<[string, Profile]> {
    return [...this.touched].map((email) => [email, this.profiles.get(email) as Profile]);
  }

  /** Writes every changed profile. Call this after all loads */
  save() {
    for (const [email, profile] of this.changed()) {
      this.tx.set(this.db.doc(`data/${email}`), profile);
    }
  }

  /**
   * Makes `chaserEmail` chase `targetEmail`.
   * A player's latest location lives in their chaser's target snapshot (getProfile writes it
   * there), so it's carried over from the target's previous chaser.
   */
  private async link(chaserEmail: string, targetEmail: string) {
    const chaser = await this.load(chaserEmail);
    const target = await this.load(targetEmail);

    const previousChaser = target.chaser && target.chaser != "none" ?
      await this.load(target.chaser) :
      undefined;
    const location = previousChaser?.target.email === targetEmail ?
      previousChaser.target.location :
      undefined;

    chaser.target = {
      firstName: target.firstName,
      lastName: target.lastName,
      email: targetEmail,
      // firestore rejects undefined values
      ...(location !== undefined && { location }),
    };
    target.chaser = chaserEmail;
    this.touch(chaserEmail);
    this.touch(targetEmail);
  }

  /**
   * Takes an alive player out of the loop, so their chaser now chases their target.
   * Their own `chaser` field is left alone on purpose: it records who got them
   * (updateLeaderboard reads it), and reviving puts them back after that player.
   * If only two were left, the other player is the winner and gets no target.
   */
  async remove(email: string): Promise<{ chaserEmail: string; winner: string | null }> {
    const player = await this.load(email);
    if (!player.alive) {
      throw new HttpsError("failed-precondition", `${email} is already out`);
    }

    const chaserEmail = player.chaser;
    const targetEmail = player.target.email;
    if (chaserEmail === email || targetEmail === email || !targetEmail || chaserEmail == "none") {
      throw new HttpsError("failed-precondition", `${email} is the last player standing`);
    }

    const chaser = await this.load(chaserEmail);
    const target = await this.load(targetEmail);
    if (chaser.target.email !== email || target.chaser !== email) {
      throw new HttpsError(
        "failed-precondition",
        `The chain around ${email} is broken (their chaser or target doesn't point back to them)`,
      );
    }

    player.alive = false;
    this.touch(email);

    // two left: chaser and target are the same person, and they just won
    if (chaserEmail === targetEmail) {
      chaser.target = NO_TARGET;
      chaser.chaser = "none";
      this.touch(chaserEmail);
      return { chaserEmail, winner: chaserEmail };
    }

    await this.link(chaserEmail, targetEmail);
    return { chaserEmail, winner: null };
  }

  /**
   * Puts a player into the loop right after `anchorEmail` (so the anchor chases them,
   * and they chase whoever the anchor was chasing). Marks them alive.
   */
  async insertAfter(email: string, anchorEmail: string) {
    if (email === anchorEmail) {
      throw new HttpsError("invalid-argument", "A player can't chase themselves");
    }

    const anchor = await this.load(anchorEmail);
    if (!anchor.alive) {
      throw new HttpsError("failed-precondition", `${anchorEmail} is out, so they can't chase anyone`);
    }

    // the winner (or a lone player) has no target, so the new player just pairs up with them
    const nextEmail = anchor.target.email || anchorEmail;

    const player = await this.load(email);
    player.alive = true;
    this.touch(email);

    // this order keeps the next player's location (link reads it from their current chaser, the anchor)
    await this.link(email, nextEmail);
    await this.link(anchorEmail, email);
  }

  /**
   * Finds where an out player fits back in: whoever tagged them, or if that player is out too,
   * whoever tagged *them*, and so on. Each tag hands the tagged player's spot to their chaser,
   * so the first alive player up that line holds the spot the revived player came from.
   * Returns null if the line runs out (e.g. an observer who never played).
   */
  async closestAliveChaser(email: string): Promise<string | null> {
    const seen = new Set([email]);
    let current = (await this.load(email)).chaser;

    while (current && current != "none" && !seen.has(current)) {
      seen.add(current);
      let player;
      try {
        player = await this.load(current);
      } catch {
        return null; // their tagger's profile was deleted
      }
      if (player.alive) return current;
      current = player.chaser;
    }
    return null;
  }

  /**
   * Moves an alive player so they come right after `anchorEmail` in the loop.
   * Their old chaser now chases their old target, like a tag out without the tag.
   */
  async moveAfter(email: string, anchorEmail: string) {
    if (email === anchorEmail) {
      throw new HttpsError("invalid-argument", "A player can't chase themselves");
    }

    const anchor = await this.load(anchorEmail);
    if (anchor.target.email === email) return; // already there

    const player = await this.load(email);
    if (!player.alive) {
      throw new HttpsError("failed-precondition", `${email} is out. Set them alive to revive them instead`);
    }

    // pull them out of the loop without killing them, then put them back after the anchor
    const { winner } = await this.remove(email);
    if (winner) {
      // can't happen: with two players the anchor is always already their chaser
      throw new HttpsError("internal", "Unexpected chain state");
    }
    await this.insertAfter(email, anchorEmail);
  }
}
