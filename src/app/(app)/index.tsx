/**
 * (app)/index.tsx: Profile tab
 *
 * Port of `website/app/routes/profile.tsx`, in the same order:
 *   1. identity card: photo (or initials), name, own building, check-in pill, Sign out
 *   2. Tags
 *   3. hold-to-confirm Tag Out (alive only)
 *   4. Target: name, email, and their building under a Spoiler (alive only)
 *   5. Last Words
 * Admins get a "Proceed to Admin Panel" card instead (the admin panel is website-only).
 *
 * Data (see lib/cache.ts): profile, settings and last words render from the saved
 * cache instantly and refresh in the background. When the player is alive, a
 * `player`, and location or check-in is on, every profile refresh also sends a
 * one-shot location: that single getProfile call reports their building, checks
 * them in, and (with "share to see") reveals their target's building.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as api from "@/lib/api";
import type { GameSettings, LastWordsEntry, Profile } from "@/lib/api";
import { KEYS, peek, useCached } from "@/lib/cache";
import { getCoords } from "@/lib/location";
import { signOut } from "@/lib/firebase";
import { useAuth } from "@/lib/useAuth";
import { copy, fill } from "@/lib/copy";
import { colors, fontSize, spacing } from "@/lib/theme";
import { TagOutButton } from "@/components/TagOutButton";
import { Spoiler } from "@/components/Spoiler";
import { CHECKED_IN_RING, CheckInBadge, VerifiedCheck } from "@/components/CheckInBadge";
import {
  AppHeader,
  Card,
  ErrorView,
  GotchaLoader,
  Heading,
  OfflineNote,
  StatCard,
  TabScreen,
} from "@/components/ui";

// Check-in days are school days in the school's time zone (functions/src/schoolTime.ts).
const schoolDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function checkedInToday(checkedInAt: number | undefined) {
  return (
    checkedInAt !== undefined &&
    schoolDayFormat.format(checkedInAt) === schoolDayFormat.format(Date.now())
  );
}

/** Minutes after midnight → "8:00 PM". */
function formatDeadline(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

type Sharing = "idle" | "locating" | "shared" | "failed";

export default function ProfileScreen() {
  const settingsQ = useCached(KEYS.settings, api.getGameSettings);
  const lastWordsQ = useCached(KEYS.lastWords, api.getLastWords);

  // Location sharing state. `revealed` is whether the last share went through,
  // which is what "share to see" waits for; it doesn't flicker during a re-share.
  const [sharing, setSharing] = useState<Sharing>("idle");
  const [revealed, setRevealed] = useState(false);
  const freshNext = useRef(false); // the next share should skip the last known position

  const settings = settingsQ.data;

  /** getProfile with a one-shot location when the rules allow it, plain otherwise. */
  const fetchProfile = async (): Promise<Profile | null> => {
    const current = peek<Profile | null>(KEYS.profile);
    const rules = peek<GameSettings>(KEYS.settings);
    const share =
      !!current &&
      !!rules &&
      current.alive &&
      current.role === "player" &&
      (rules.locationEnabled || rules.checkInEnabled);
    if (!share) return api.getProfile();

    setSharing("locating");
    const coords = await getCoords({ fresh: freshNext.current });
    freshNext.current = false;
    if (!coords) {
      setSharing("failed");
      setRevealed(false);
      return api.getProfile();
    }
    try {
      const profile = await api.getProfile(coords);
      setSharing("shared");
      setRevealed(true);
      return profile;
    } catch (e) {
      setSharing("failed");
      setRevealed(false);
      throw e;
    }
  };
  const profileQ = useCached(KEYS.profile, fetchProfile);
  const profile = profileQ.data;

  const canShare =
    !!profile &&
    !!settings &&
    profile.alive &&
    profile.role === "player" &&
    (settings.locationEnabled || settings.checkInEnabled);

  // Share once per visit as soon as we know we may (like the website's page load),
  // even if the cached profile is still fresh.
  const refreshProfile = profileQ.refresh;
  useEffect(() => {
    if (canShare && sharing === "idle") refreshProfile();
  }, [canShare, sharing, refreshProfile]);

  /** Check-in pill tap: share again with a fresh position. */
  const checkIn = useCallback(() => {
    freshNext.current = true;
    refreshProfile();
  }, [refreshProfile]);

  const refreshAll = () => {
    profileQ.refresh();
    settingsQ.refresh();
    lastWordsQ.refresh();
  };

  const firstError = profileQ.error ?? settingsQ.error;
  if (!profile || !settings) {
    if (firstError && !profileQ.loading && !settingsQ.loading) {
      return (
        <TabScreen>
          <ErrorView message={api.errorMessage(firstError)} onRetry={refreshAll} />
        </TabScreen>
      );
    }
    if (profileQ.data === null) {
      return (
        <TabScreen>
          <ErrorView message={copy.profile.noProfile} onRetry={refreshAll} />
        </TabScreen>
      );
    }
    return (
      <TabScreen>
        <GotchaLoader />
      </TabScreen>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={profileQ.refreshing}
            onRefresh={refreshAll}
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.card}
          />
        }
      >
        <AppHeader />
        <OfflineNote visible={!!firstError} />
        {profile.role === "admin" ? (
          <AdminCard />
        ) : (
          <PlayerProfile
            profile={profile}
            settings={settings}
            sharing={sharing}
            revealed={revealed}
            onCheckIn={checkIn}
            lastWords={lastWordsQ.data}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PlayerProfile({
  profile,
  settings,
  sharing,
  revealed,
  onCheckIn,
  lastWords,
}: {
  profile: Profile;
  settings: GameSettings;
  sharing: Sharing;
  revealed: boolean;
  onCheckIn: () => void;
  lastWords: LastWordsEntry[] | undefined;
}) {
  const { user } = useAuth();
  const [photoFailed, setPhotoFailed] = useState(false);

  const alive = profile.alive;
  const isCheckedIn = checkedInToday(profile.checkedInAt);
  const showCheckedIn = alive && settings.checkInEnabled && isCheckedIn;
  const where = settings.checkInBuilding ?? copy.checkIn.anyBuilding;
  const deadline = formatDeadline(settings.checkInDeadline);

  // The target's building is a location feature, so it's all off when location is off.
  const seeTargetLocation = settings.locationEnabled && settings.seeTargetLocation;
  const hiddenUntilShared = seeTargetLocation && settings.shareToSeeTargetLocation;
  const targetLocation = profile.target?.location ?? null;
  const showTargetLocation =
    seeTargetLocation &&
    (hiddenUntilShared ? !revealed || targetLocation !== null : targetLocation !== null);
  const spoilerHidden = hiddenUntilShared && !revealed;

  const checkInHint =
    sharing === "failed"
      ? copy.checkIn.needsLocation
      : sharing === "shared" && !profile.location
        ? copy.checkIn.notInBuilding
        : null;

  const tagOut = async () => {
    try {
      await api.tagOut();
      router.push({ pathname: "/last-words", params: { canSubmit: "1" } });
    } catch (e) {
      console.error("tagOut error:", e);
      Alert.alert(copy.profile.tagOut, api.errorMessage(e));
    }
  };

  return (
    <>
      <Heading>{copy.profile.title}</Heading>

      {/* Identity */}
      <Card style={showCheckedIn ? styles.ringed : null}>
        {user?.photoURL && !photoFailed ? (
          <Image
            source={{ uri: user.photoURL }}
            style={styles.avatar}
            onError={() => setPhotoFailed(true)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.avatar, styles.initials]}>
            <Text style={styles.initialsText}>
              {profile.firstName?.[0]}
              {profile.lastName?.[0]}
            </Text>
          </View>
        )}
        <View style={styles.nameRow}>
          <Text style={styles.name}>
            {profile.firstName} {profile.lastName}
          </Text>
          {showCheckedIn ? (
            <VerifiedCheck
              size={Math.round(fontSize.headline * 0.85)}
              tooltip={fill(copy.checkIn.checkedInTooltip, { where, deadline })}
            />
          ) : null}
        </View>
        {profile.location ? <Text style={styles.subtle}>{profile.location}</Text> : null}
        {alive && settings.checkInEnabled ? (
          <CheckInBadge
            checkedIn={isCheckedIn}
            label={fill(copy.checkIn.prompt, { where, deadline })}
            locating={sharing === "locating"}
            hint={checkInHint}
            onCheckIn={onCheckIn}
          />
        ) : null}
        <Pressable onPress={signOut} accessibilityRole="button" hitSlop={8}>
          {({ pressed }) => (
            <Text style={[styles.signOut, pressed && { color: colors.text }]}>
              {copy.nav.signOut}
            </Text>
          )}
        </Pressable>
      </Card>

      <StatCard label={copy.profile.tags} value={profile.tags} />

      {alive ? (
        <>
          <TagOutButton text={copy.profile.tagOut} onConfirm={tagOut} />

          <Card>
            <Text style={styles.cardTitle}>{copy.profile.target}</Text>
            <Text style={styles.big}>
              {profile.target.firstName} {profile.target.lastName}
            </Text>
            <Text style={styles.subtle}>{profile.target.email}</Text>
            {showTargetLocation ? (
              <View style={styles.targetLocation}>
                <Spoiler
                  text={targetLocation ?? copy.profile.targetLocationPlaceholder}
                  hidden={spoilerHidden}
                  style={styles.targetLocationText}
                  hiddenLabel={copy.profile.shareToSee}
                />
                {spoilerHidden ? (
                  <Text style={styles.hint}>
                    {sharing === "failed" ? copy.profile.shareToSeeFailed : copy.profile.shareToSee}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      <Heading>{copy.profile.lastWords}</Heading>
      {(lastWords ?? []).map((lw) => (
        <Card key={lw.timestamp} style={styles.lastWordsCard}>
          <Text style={styles.quote}>&quot;{lw.lw}&quot;</Text>
          <Text style={styles.attribution}>
            {fill(copy.profile.lastWordsAttribution, {
              author: lw.author,
              date: new Date(lw.timestamp).toLocaleString(undefined, {
                year: "numeric",
                month: "numeric",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }),
            })}
          </Text>
        </Card>
      ))}
    </>
  );
}

/** Admins don't play; the admin panel is on the website. */
function AdminCard() {
  const { user } = useAuth();
  return (
    <>
      <Heading>{copy.profile.title}</Heading>
      <Card>
        <Text style={styles.big}>{copy.profile.adminTitle}</Text>
        {user?.email ? <Text style={styles.subtle}>{user.email}</Text> : null}
        <Text style={styles.hint}>{copy.profile.adminHint}</Text>
        <Pressable onPress={signOut} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.signOut}>{copy.nav.signOut}</Text>
        </Pressable>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.card, paddingTop: 0, gap: spacing.stack },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  initials: { backgroundColor: colors.button, alignItems: "center", justifyContent: "center" },
  initialsText: { color: colors.textSecondary, fontSize: 30, fontWeight: "bold" },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 8 },
  // ring-2 sits outside the card on the website; trim the padding so nothing moves
  ringed: { ...CHECKED_IN_RING, padding: spacing.card - CHECKED_IN_RING.borderWidth },
  name: { color: colors.text, fontSize: fontSize.headline, fontWeight: "bold", textAlign: "center" },
  subtle: { color: colors.textSecondary, fontStyle: "italic", fontWeight: "300", textAlign: "center" },
  signOut: { color: colors.textMuted, fontSize: fontSize.small, paddingTop: 4 },
  cardTitle: { color: colors.text, fontSize: fontSize.title, fontWeight: "600" },
  big: { color: colors.text, fontSize: fontSize.headline, fontWeight: "bold", textAlign: "center" },
  targetLocation: { marginTop: spacing.list, alignItems: "center", gap: 4 },
  targetLocationText: { color: colors.text, fontSize: 18, fontWeight: "600" },
  hint: { color: colors.textMuted, fontSize: fontSize.caption, textAlign: "center" },
  lastWordsCard: { alignItems: "flex-start" },
  quote: { color: colors.text, fontStyle: "italic" },
  attribution: { color: colors.textSecondary, fontSize: fontSize.small },
});
