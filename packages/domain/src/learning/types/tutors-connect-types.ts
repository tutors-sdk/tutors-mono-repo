// Supabase `tutors-connect-courses` table model
export interface TutorsConnectCourse {
  course_id: string;
  visited_at: string; // timestamptz not null (ISO string)
  visit_count: number | null; // bigint null
  course_record: {
    title?: string;
    /** Course image URL (displayed in AppBar when no icon) */
    img?: string | null;
    /** Course icon (Iconify): type = icon id, color = optional CSS color */
    icon?: { type: string; color?: string } | null;
    [key: string]: unknown;
  } | null; // json null
}

// Supabase `tutors-connect-users` table model (public.tutors-connect-users)
export interface TutorsConnectUser {
  github_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  online_status: string | null;
  date_last_accessed: string | null; // timestamptz (ISO string)
  sentiment: string | null;
}
