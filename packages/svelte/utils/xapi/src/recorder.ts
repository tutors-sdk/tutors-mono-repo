/**
 * Sends statements to the LRS only for students who have consented to learning analytics.
 */

import type { LrsClient } from "./lrs-client.ts";
import type { XapiStatement } from "./statement.ts";

export interface StatementRecorderOptions {
  client: LrsClient;
  /** Whether the student with this GitHub login has consented to learning analytics. */
  hasConsent(login: string): boolean | Promise<boolean>;
}

export interface StatementRecorder {
  /** Sends the statement when its student has consented; returns whether it was sent. */
  record(statement: XapiStatement): Promise<boolean>;
}

export function createStatementRecorder(options: StatementRecorderOptions): StatementRecorder {
  return {
    async record(statement) {
      if (!(await options.hasConsent(statement.actor.account.name))) return false;
      await options.client.send([statement]);
      return true;
    }
  };
}
