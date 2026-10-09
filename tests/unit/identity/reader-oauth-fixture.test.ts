import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { AUTH_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, githubAccount, githubCallback, githubResponse } from "../../bdd/support/reader-oauth.mjs";

const preload = new URL("../../../apps/reader/tests/e2e/oauth-preload.mjs", import.meta.url);
const env = { ...process.env, NODE_OPTIONS: "", NODE_ENV: "test", PRIVATE_AUTH_SECRET: AUTH_SECRET,
  PRIVATE_AUTH_GITHUB_ID: GITHUB_CLIENT_ID, PRIVATE_AUTH_GITHUB_SECRET: GITHUB_CLIENT_SECRET };

describe("shared reader OAuth fixture", () => {
  it("echoes state and preserves the callback URL for success and refusal", () => {
    const authorize = "https://github.com/login/oauth/authorize?redirect_uri=https%3A%2F%2Ftutors.test%2Fauth%2Fcallback%2Fgithub&state=opaque-state";
    expect(githubCallback(authorize, "student").href).toBe("https://tutors.test/auth/callback/github?code=student&state=opaque-state");
    expect(githubCallback(authorize, "ignored", true).searchParams.get("error")).toBe("access_denied");
    expect(() => githubCallback("https://github.com/login/oauth/authorize")).toThrow("redirect_uri");
  });

  it("shares the provider responses without treating another host as GitHub", async () => {
    const account = githubAccount("Student", 1001);
    expect(await githubResponse(new URL("https://api.github.com/user"), account)!.json()).toEqual(account);
    expect(await githubResponse(new URL("https://api.github.com/user/emails"), account)!.json()).toEqual([{ email: account.email, primary: true, verified: true }]);
    expect(githubResponse(new URL("https://github.com/login/oauth/access_token"), account, true)!.status).toBe(400);
    expect(githubResponse(new URL("https://other.test/user"), account)).toBeNull();
  });

  it("isolates accounts per token/code and rejects unknown codes and incorrect credentials", () => {
    execFileSync(process.execPath, ["--import", preload.href, "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      const exchange = async (code, client_secret = ${JSON.stringify(GITHUB_CLIENT_SECRET)}) => fetch("https://github.com/login/oauth/access_token", {
        method: "POST", body: new URLSearchParams({ code, client_id: ${JSON.stringify(GITHUB_CLIENT_ID)}, client_secret })
      });
      const [student, lecturer] = await Promise.all([exchange("student"), exchange("lecturer")]);
      assert.equal((await student.json()).access_token, "gho_fixture_1001");
      assert.equal((await lecturer.json()).access_token, "gho_fixture_1002");
      const basic = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST", headers: { authorization: "Basic " + Buffer.from(${JSON.stringify(GITHUB_CLIENT_ID + ':' + GITHUB_CLIENT_SECRET)}).toString("base64") },
        body: new URLSearchParams({ code: "student" })
      });
      assert.equal((await basic.json()).access_token, "gho_fixture_1001");
      assert.equal((await exchange("unknown")).status, 400);
      assert.equal((await exchange("student", "wrong")).status, 401);
      const wrongClient = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST", body: new URLSearchParams({ code: "student", client_id: "wrong", client_secret: ${JSON.stringify(GITHUB_CLIENT_SECRET)} })
      });
      assert.equal(wrongClient.status, 401);
      for (const [id, login] of [[1001, "student"], [1002, "lecturer"]]) {
        const user = await fetch("https://api.github.com/user", { headers: { authorization: "Bearer gho_fixture_" + id } });
        assert.equal((await user.json()).login, login);
      }
      await assert.rejects(fetch("https://api.github.com/user", { headers: { authorization: "Bearer forged" } }));
    `], { env, stdio: "pipe" });
  });

  it.each([ { NODE_ENV: "production" }, { PRIVATE_AUTH_SECRET: "another-secret" }, { PRIVATE_AUTH_GITHUB_ID: "another-client" }, { PRIVATE_AUTH_GITHUB_SECRET: "another-secret" } ])("refuses a preload outside its explicit test configuration: %j", overrides => {
    expect(() => execFileSync(process.execPath, ["--import", preload.href, "-e", ""], { env: { ...env, ...overrides }, stdio: "pipe" })).toThrow("GitHub fixture requires");
  });
});
