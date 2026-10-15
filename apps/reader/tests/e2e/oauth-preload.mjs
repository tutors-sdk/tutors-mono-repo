import { readFileSync } from "node:fs";
import { AUTH_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, githubAccount, githubResponse } from "../../../../tests/bdd/support/reader-oauth.mjs";

// Explicit NODE_OPTIONS preload only; the production reader never imports this file.
if (
  process.env.NODE_ENV !== "test" ||
  process.env.PRIVATE_AUTH_SECRET !== AUTH_SECRET ||
  process.env.PRIVATE_AUTH_GITHUB_ID !== GITHUB_CLIENT_ID ||
  process.env.PRIVATE_AUTH_GITHUB_SECRET !== GITHUB_CLIENT_SECRET
) {
  throw new Error("GitHub fixture requires NODE_ENV=test and the isolated test credentials");
}

// The built-server rehearsal advances time without altering production clocks.
if (process.env.TEST_IDENTITY_CLOCK_FILE) {
  const RealDate = Date;
  const now = () => Number(readFileSync(process.env.TEST_IDENTITY_CLOCK_FILE, "utf8"));
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now()]));
    }
    static now() {
      return now();
    }
  };
}
const student = githubAccount("Student", Number(process.env.TEST_GITHUB_STUDENT_ID ?? 1001));
student.login = process.env.TEST_GITHUB_STUDENT_LOGIN ?? student.login;
const accounts = [student, githubAccount("Lecturer", 1002)];
const fetchProvider = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://github.com" && url.origin !== "https://api.github.com") return fetchProvider(input, init);
  const request = new Request(input, init);
  let account;
  if (url.pathname === "/login/oauth/access_token") {
    const form = new URLSearchParams(await request.text());
    const basic = `Basic ${Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString("base64")}`;
    const valid = request.headers.get("authorization") === basic || (form.get("client_id") === GITHUB_CLIENT_ID && form.get("client_secret") === GITHUB_CLIENT_SECRET);
    if (!valid) {
      return Response.json({ error: "incorrect_client_credentials" }, { status: 401 });
    }
    account = accounts.find((account) => account.login === form.get("code"));
  } else {
    account = accounts.find((account) => request.headers.get("authorization") === `Bearer gho_fixture_${account.id}`);
  }
  const response = githubResponse(url, account ?? null);
  if (response) return response;
  throw new Error(`Unexpected GitHub fixture request: ${url.pathname}`);
};
