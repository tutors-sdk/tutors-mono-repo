import type { MockLearningObject } from "./world";

export interface WhitelistEntry {
  courseId: string;
  githubId: string;
  role: "student" | "instructor";
  addedAt: string;
}

export interface ThemeConfig {
  name: string;
  colorScheme: "light" | "dark";
  primaryColor: string;
  iconLibrary: "fluent" | "hero" | "lucide" | "la";
}

export interface SearchResult {
  fenced: boolean;
  language: string;
  contentMd: string;
  title: string;
  link: string;
  html: string;
}

export interface LabStep {
  title: string;
  shortTitle: string;
  contentMd: string;
  route: string;
  id: string;
  type: string;
}

export interface PresenceRoom {
  roomId: string;
  courseId: string;
  participants: Array<{ fullName: string; avatar: string; id: string; sentiment?: string }>;
}

export interface I18nMessages {
  locale: string;
  messages: Record<string, string>;
}

export interface AuthSession {
  userId: string;
  provider: "github";
  accessToken: string;
  expiresAt: number;
  user: { name: string; avatar: string; email: string };
}

let whitelistCounter = 0;
let searchCounter = 0;
let labStepCounter = 0;
let roomCounter = 0;

export class ExtendedTestDataFactory {
  createWhitelistEntry(overrides: Partial<WhitelistEntry> = {}): WhitelistEntry {
    whitelistCounter++;
    return {
      courseId: "course-1",
      githubId: `github-user-${whitelistCounter}`,
      role: "student",
      addedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  createThemeConfig(overrides: Partial<ThemeConfig> = {}): ThemeConfig {
    return {
      name: "tutors",
      colorScheme: "light",
      primaryColor: "#3b82f6",
      iconLibrary: "fluent",
      ...overrides,
    };
  }

  createSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
    searchCounter++;
    return {
      fenced: false,
      language: "",
      contentMd: `Search result content ${searchCounter}`,
      title: `Result ${searchCounter}`,
      link: `/course/topic/result-${searchCounter}`,
      html: "",
      ...overrides,
    };
  }

  createLabStep(overrides: Partial<LabStep> = {}): LabStep {
    labStepCounter++;
    return {
      title: `Step ${labStepCounter}`,
      shortTitle: `Step ${labStepCounter}`,
      contentMd: `# Step ${labStepCounter}\n\nStep content here.`,
      route: `/lab/step-${labStepCounter}`,
      id: `step-${labStepCounter}`,
      type: "step",
      ...overrides,
    };
  }

  createPresenceRoom(overrides: Partial<PresenceRoom> = {}): PresenceRoom {
    roomCounter++;
    return {
      roomId: `room-${roomCounter}`,
      courseId: "course-1",
      participants: [],
      ...overrides,
    };
  }

  createI18nMessages(locale: string, overrides: Record<string, string> = {}): I18nMessages {
    return {
      locale,
      messages: {
        "nav.search": "Search",
        "nav.layout": "Layout",
        "error.fallback": "Something went wrong",
        ...overrides,
      },
    };
  }

  createAuthSession(overrides: Partial<AuthSession> = {}): AuthSession {
    return {
      userId: "github-user-1",
      provider: "github",
      accessToken: "gho_test_token_abc123",
      expiresAt: Date.now() + 3600000,
      user: { name: "Test User", avatar: "https://avatars.example.com/1.png", email: "test@example.com" },
      ...overrides,
    };
  }

  createLearningObjectWithSteps(stepCount: number, overrides: Partial<MockLearningObject> = {}): MockLearningObject & { steps: LabStep[] } {
    const steps: LabStep[] = [];
    for (let i = 0; i < stepCount; i++) {
      steps.push(this.createLabStep());
    }
    return {
      type: "lab",
      title: `Lab with ${stepCount} steps`,
      route: `/lab-with-steps`,
      steps,
      ...overrides,
    };
  }
}
