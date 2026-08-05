export interface Persona {
  role: "student" | "instructor" | "developer";
  displayName: string;
  permissions: string[];
  defaultState: Record<string, unknown>;
}

export const STUDENT: Persona = {
  role: "student",
  displayName: "Student User",
  permissions: ["view-course", "view-labs", "view-talks", "search", "track-presence"],
  defaultState: {
    authenticated: false,
    sharePresence: true,
    isPrivate: false,
  },
};

export const INSTRUCTOR: Persona = {
  role: "instructor",
  displayName: "Course Instructor",
  permissions: [
    "view-course", "view-labs", "view-talks", "search", "track-presence",
    "view-analytics", "view-calendar", "view-lab-analytics", "manage-whitelist",
    "view-student-engagement",
  ],
  defaultState: {
    authenticated: true,
    sharePresence: true,
    isPrivate: false,
  },
};

export const DEVELOPER: Persona = {
  role: "developer",
  displayName: "Platform Developer",
  permissions: [
    "view-course", "view-labs", "view-talks", "search", "track-presence",
    "view-analytics", "view-calendar", "view-lab-analytics", "manage-whitelist",
    "view-student-engagement", "configure-themes", "configure-i18n", "manage-auth",
  ],
  defaultState: {
    authenticated: true,
    sharePresence: true,
    isPrivate: false,
  },
};

export const PERSONAS = { student: STUDENT, instructor: INSTRUCTOR, developer: DEVELOPER } as const;

export function getPersona(role: Persona["role"]): Persona {
  return PERSONAS[role];
}
