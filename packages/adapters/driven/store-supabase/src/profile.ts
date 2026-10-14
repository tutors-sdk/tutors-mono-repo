/**
 * What Supabase keeps about a signed-in learner: their record in `tutors-connect-users`
 * (name, avatar, sentiment, whether they share presence) and their course-visit history in
 * `tutors-connect-profiles`. `supabaseProfile` is the application's ProfilePort over both.
 */
import type { TutorsId } from "@tutors/domain/course";
import { COURSE_SENTIMENT_IDS } from "@tutors/domain/course";
import { parseSentiment, parseSharing, onlineStatusFor, type CourseVisit } from "@tutors/domain/presence";
import type { LearnerProfile, ProfilePort } from "@tutors/application/ports";
import log from "@tutors/logger";
import { supabase } from "./client.ts";

/**
 * Creates or updates a student record in the database
 * @async
 * @param student - Student data to store
 */
export async function addOrUpdateStudent(student: TutorsId) {
  if (!student || !supabase) return;

  try {
    let fullName = student.name;

    // If name is null or empty, fetch from GitHub API
    if (!fullName && student.login) {
      try {
        const response = await fetch(`https://api.github.com/users/${student.login}`);
        if (response.ok) {
          const githubUser = await response.json();
          fullName = githubUser.name || student.login;
        } else {
          // Fallback to login if API call fails
          fullName = student.login;
        }
      } catch (fetchError) {
        log.error("Failed to fetch GitHub user:", fetchError);
        // Fallback to login if API call fails
        fullName = student.login;
      }
    }

    const row: {
      github_id: string;
      avatar_url: string;
      full_name: string;
      email: string;
      date_last_accessed: string;
      sentiment: string;
      online_status?: string;
    } = {
      github_id: student.login,
      avatar_url: student.image,
      full_name: fullName,
      email: student.email,
      date_last_accessed: new Date().toISOString(),
      sentiment: student.sentiment
    };
    if (student.share === "true") {
      row.online_status = "online";
    } else if (student.share === "false") {
      row.online_status = "offline";
    }

    const { error } = await supabase!.from("tutors-connect-users").upsert(row);

    if (error) {
      log.error("Upsert failed:", error);
      throw error;
    }
  } catch (error) {
    log.error("An error occurred in addOrUpdateUserProfile:", error);
    throw error;
  }
}

function normalizeStoredSentiment(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim();
  return (COURSE_SENTIMENT_IDS as readonly string[]).includes(s) ? s : null;
}

/**
 * Fetches sentiment for a row in tutors-connect-users.
 * @param githubId - Student GitHub login (primary key for the row)
 * @returns Stored sentiment if present and valid per {@link COURSE_SENTIMENT_IDS}, otherwise null (includes no row).
 */
export async function getTutorsConnectUserSentiment(githubId: string): Promise<string | null> {
  if (!supabase || !githubId) return null;

  const { data, error } = await supabase!.from("tutors-connect-users").select("sentiment").eq("github_id", githubId).maybeSingle();

  if (error) {
    log.error("getTutorsConnectUserSentiment failed:", error);
    throw error;
  }
  if (!data) return null;
  return normalizeStoredSentiment((data as { sentiment: string | null }).sentiment);
}

/**
 * Updates sentiment (and last-accessed) for a row in tutors-connect-users.
 * @param githubId - Student GitHub login (primary key for the row)
 * @param sentiment - Current mood string
 */
export async function updateTutorsConnectUserSentiment(githubId: string, sentiment: string) {
  if (!supabase || !githubId) return;

  const { error } = await supabase
    .from("tutors-connect-users")
    .update({
      sentiment,
      date_last_accessed: new Date().toISOString()
    })
    .eq("github_id", githubId);

  if (error) {
    log.error("updateTutorsConnectUserSentiment failed:", error);
    throw error;
  }
}

/**
 * Fetches online_status for a row in tutors-connect-users (mirrors Share Presence / {@link updateTutorsConnectUserOnlineStatus}).
 * @param githubId - Student GitHub login (primary key for the row)
 * @returns Stored online_status if present, otherwise null (includes no row).
 */
export async function getTutorsConnectUserOnlineStatus(githubId: string): Promise<string | null> {
  if (!supabase || !githubId) return null;

  const { data, error } = await supabase!.from("tutors-connect-users").select("online_status").eq("github_id", githubId).maybeSingle();

  if (error) {
    log.error("getTutorsConnectShare failed:", error);
    throw error;
  }
  if (!data) return null;
  const raw = (data as { online_status: string | null }).online_status;
  if (raw == null || !String(raw).trim()) return null;
  return String(raw).trim();
}

/**
 * Sets online_status on tutors-connect-users (mirrors share: visible / sharing = online).
 */
export async function updateTutorsConnectUserOnlineStatus(githubId: string, onlineStatus: "online" | "offline") {
  if (!supabase || !githubId) return;

  const { error } = await supabase
    .from("tutors-connect-users")
    .update({
      online_status: onlineStatus,
      date_last_accessed: new Date().toISOString()
    })
    .eq("github_id", githubId);

  if (error) {
    log.error("updateTutorsConnectUserOnlineStatus failed:", error);
    throw error;
  }
}

/** The course-visit history stored for a learner, or [] when there is none. */
export async function getStoredCourseVisits(tutorId: string): Promise<CourseVisit[]> {
  if (!supabase || !tutorId) return [];
  const { data: profile } = await supabase.from("tutors-connect-profiles").select("profile").eq("tutorId", tutorId);
  if (profile && profile.length > 0) {
    return profile[0].profile as unknown as CourseVisit[];
  }
  return [];
}

export async function saveStoredCourseVisits(tutorId: string, visits: CourseVisit[]): Promise<void> {
  if (!supabase || !tutorId) return;
  const { error } = await supabase.from("tutors-connect-profiles").upsert({ tutorId, profile: visits });
  if (error) {
    log.error("Failed to save profile:", error);
  }
}

export function supabaseProfile(): ProfilePort {
  return {
    getCourseVisits: (learnerId) => getStoredCourseVisits(learnerId),
    saveCourseVisits: (learnerId, visits) => saveStoredCourseVisits(learnerId, visits),
    async upsertLearner(profile: LearnerProfile) {
      await addOrUpdateStudent({
        login: profile.login,
        name: profile.name ?? "",
        email: profile.email ?? "",
        image: profile.image ?? "",
        sentiment: profile.sentiment ?? undefined,
        share: profile.sharing === null ? undefined : String(profile.sharing)
      } as TutorsId);
    },
    async getSentiment(learnerId) {
      return parseSentiment(await getTutorsConnectUserSentiment(learnerId));
    },
    setSentiment: (learnerId, sentiment) => updateTutorsConnectUserSentiment(learnerId, sentiment),
    async getSharing(learnerId) {
      return parseSharing(await getTutorsConnectUserOnlineStatus(learnerId));
    },
    setSharing: (learnerId, sharing) => updateTutorsConnectUserOnlineStatus(learnerId, onlineStatusFor(sharing))
  };
}
