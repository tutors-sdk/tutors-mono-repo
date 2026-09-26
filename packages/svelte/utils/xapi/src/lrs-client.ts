/**
 * A minimal client for the xAPI statements resource of a Learning Record Store.
 *
 * It holds the store's key and secret, so it runs on the server only (a SvelteKit endpoint or a
 * bus consumer), never in the browser.
 */

import { trimTrailingSlashes } from "./slashes.ts";
import { XAPI_VERSION, type XapiStatement } from "./statement.ts";

export interface LrsConfig {
  /** The LRS's xAPI root, e.g. "http://lrs:8080/xapi". */
  endpoint: string;
  key: string;
  secret: string;
  fetch?: typeof fetch;
}

export interface LrsClient {
  /** Stores the statements and returns the ids the LRS gave them. */
  send(statements: XapiStatement[]): Promise<string[]>;
}

export function createLrsClient(config: LrsConfig): LrsClient {
  const doFetch = config.fetch ?? fetch;
  const url = `${trimTrailingSlashes(config.endpoint)}/statements`;
  const authorization = `Basic ${btoa(`${config.key}:${config.secret}`)}`;
  return {
    async send(statements) {
      if (statements.length === 0) return [];
      const response = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Experience-API-Version": XAPI_VERSION, Authorization: authorization },
        body: JSON.stringify(statements)
      });
      if (!response.ok) throw new Error(`LRS rejected ${statements.length} statement(s): HTTP ${response.status}`);
      return (await response.json()) as string[];
    }
  };
}
