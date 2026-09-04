/**
 * Quiz data model.
 *
 * These types describe the full quiz feature (authoring, persistence, live
 * sessions and analytics) so that later phases build against a stable shape.
 * Phase 1 only exercises the authoring types (`QuizQuestion`, `QuestionType`)
 * via the markdown parser; the remainder are defined here up front.
 */

export type QuestionType = "multiple-choice" | "true-false";

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options: string[];
  /** 0-based index into `options` of the correct answer. */
  correctIndex: number;
}

export type QuizSource = "course" | "dynamic";
export type QuizStatus = "draft" | "published" | "archived";

export interface Quiz {
  id: string;
  courseId: string;
  title: string;
  questions: QuizQuestion[];
  createdBy: string;
  source: QuizSource;
  /** Seconds allowed per question, or null for untimed. */
  timeLimit: number | null;
  status: QuizStatus;
  createdAt: string;
}

export type SessionStatus = "waiting" | "active" | "reviewing" | "completed";

export interface QuizSession {
  id: string;
  quizId: string;
  courseId: string;
  lecturerId: string;
  status: SessionStatus;
  currentQuestion: number;
  startedAt: string;
  endedAt: string | null;
}

export interface QuizResponse {
  id: string;
  quizId: string;
  /** null for async (self-paced) responses; set for live-session responses. */
  sessionId: string | null;
  questionId: string;
  studentId: string;
  selectedIndex: number;
  isCorrect: boolean;
  responseTimeMs: number;
  submittedAt: string;
}

/**
 * Live-session message protocol. Transport is Supabase realtime channels
 * (modelled on the community presence service); these messages are the
 * payloads carried over that channel.
 */

export interface QuizJoinMessage {
  type: "quiz:join";
  studentId: string;
  studentName: string;
  avatar: string;
}

export interface QuizQuestionMessage {
  type: "quiz:question";
  questionIndex: number;
  text: string;
  options: string[];
  questionType: QuestionType;
  timeLimit: number | null;
}

export interface QuizAnswerMessage {
  type: "quiz:answer";
  studentId: string;
  questionIndex: number;
  selectedIndex: number;
  responseTimeMs: number;
}

export interface QuizRevealMessage {
  type: "quiz:reveal";
  questionIndex: number;
  correctIndex: number;
  distribution: number[];
}

export interface QuizEndMessage {
  type: "quiz:end";
}

export interface QuizParticipantCountMessage {
  type: "quiz:participant-count";
  count: number;
}

export type QuizMessage =
  | QuizJoinMessage
  | QuizQuestionMessage
  | QuizAnswerMessage
  | QuizRevealMessage
  | QuizEndMessage
  | QuizParticipantCountMessage;

export interface QuizLiveStartedNotification {
  type: "quiz:live-started";
  sessionId: string;
  quizTitle: string;
  courseId: string;
  lecturerName: string;
  quiz?: Quiz;
  session?: QuizSession;
}

export interface QuestionAnalytics {
  questionIndex: number;
  questionId: string;
  totalResponses: number;
  correctCount: number;
  incorrectCount: number;
  distribution: number[];
  avgResponseTimeMs: number;
  fastestResponseMs: number;
  slowestResponseMs: number;
}
