import type { TutorQuestion, TutorReply } from "@tutors/domain/pedagogy";

/** Answers a learner's question about the course they are reading. Ollama is the planned adapter; a fake answers in tests. */
export interface TutorAssistant {
  ask(question: TutorQuestion): Promise<TutorReply>;
}
