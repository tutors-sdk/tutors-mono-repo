// Test-only GitHub responses shared by the HTTP Rules and Playwright's server preload.
export const GITHUB_CLIENT_ID = "tutors-oauth-app";
export const GITHUB_CLIENT_SECRET = "tutors-oauth-secret";
export const AUTH_SECRET = "a-test-secret-that-is-at-least-thirty-two-chars";

/** @typedef {{ id: number, login: string, name: string, email: string, avatar_url: string }} GithubAccount */

/** @param {string} name @returns {GithubAccount} */
export function githubAccount(name, id = 1000) {
  const login = name.toLowerCase();
  return { id, login, name, email: `${login}@example.com`, avatar_url: `https://avatars.example/${login}.png` };
}

/** @param {URL} url @param {GithubAccount | null} account */
export function githubResponse(url, account, refuses = false) {
  if (url.origin === "https://github.com" && url.pathname === "/login/oauth/access_token") {
    if (refuses || !account) return Response.json({ error: "bad_verification_code" }, { status: 400 });
    return Response.json({ access_token: `gho_fixture_${account.id}`, token_type: "bearer", scope: "read:user,user:email" });
  }
  if (url.origin === "https://api.github.com" && url.pathname === "/user" && account) return Response.json(account);
  if (url.origin === "https://api.github.com" && url.pathname === "/user/emails" && account) {
    return Response.json([{ email: account.email, primary: true, verified: true }]);
  }
  return null;
}

/** GitHub echoes the authorization state when returning a code or refusal. @param {string} authorizeUrl */
export function githubCallback(authorizeUrl, code = "github-code", refused = false) {
  const authorize = new URL(authorizeUrl);
  const redirect = authorize.searchParams.get("redirect_uri");
  if (!redirect) throw new Error("OAuth authorization response has no redirect_uri");
  const callback = new URL(redirect);
  callback.searchParams.set(refused ? "error" : "code", refused ? "access_denied" : code);
  const state = authorize.searchParams.get("state");
  if (state) callback.searchParams.set("state", state);
  return callback;
}

/** The request shape shared by the HTTP and browser drivers. @param {string} returnTo */
export function signInRequest(returnTo) {
  return { path: "/api/auth/sign-in/social", json: { provider: "github", callbackURL: returnTo, errorCallbackURL: "/auth?error=denied" } };
}

/** @param {string} name */
export const isSessionCookie = (name) => /better-auth\.session_(?:data|token)$/.test(name);
/** The encrypted claims cookie; Better Auth also requires its signed session_token. @param {string} name */
export const isClaimsCookie = (name) => /better-auth\.session_data$/.test(name);
