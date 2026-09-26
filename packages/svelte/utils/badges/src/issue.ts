/**
 * Issues a topic badge when a student meets its criterion.
 */

import { hasOpenedEveryLearningObject } from "./criteria.ts";
import { topicBadgeCredential, type OpenBadgeCredential, type TopicBadgeInput } from "./credential.ts";
import type { SigningClient } from "./signing-client.ts";

export interface IssueTopicBadgeInput extends TopicBadgeInput {
  topicLoRoutes: readonly string[];
  openedRoutes: Iterable<string>;
  signer: SigningClient;
}

/** The signed credential, or null when the student has not opened every learning object in the topic. */
export async function issueTopicBadge(input: IssueTopicBadgeInput): Promise<OpenBadgeCredential | null> {
  if (!hasOpenedEveryLearningObject(input.topicLoRoutes, input.openedRoutes)) return null;
  return input.signer.sign(topicBadgeCredential(input));
}
