import type { TeachingContext, TutorReply } from "@tutors/domain/pedagogy";
import type { TutorAssistant } from "../ports/tutor-assistant.ts";

export type AskTutorDeps = { assistant: TutorAssistant };

/** A learner asked the tutor about where they are in the course. An empty question gets no answer. */
export const askTutor = ({ assistant }: AskTutorDeps) =>
  async (context: TeachingContext, question: string): Promise<TutorReply | null> => {
    if (!question.trim()) return null;
    return assistant.ask({ context, question });
  };
