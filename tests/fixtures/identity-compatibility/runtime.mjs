import { readFileSync } from "node:fs";

// Only the disposable server loads this file; GitHub and the clock are its test seams.
const NativeDate = Date;
const clockFile = process.env.SPIKE_CLOCK_FILE;
const now = () => (clockFile ? Number(readFileSync(clockFile, "utf8")) : NativeDate.now());
globalThis.Date = class extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [now()]));
  }
  static now() {
    return now();
  }
};

const realFetch = globalThis.fetch;
const account = {
  id: Number(process.env.SPIKE_GITHUB_ID ?? "1000"),
  login: process.env.SPIKE_GITHUB_LOGIN ?? "alice",
  name: "Alice",
  email: "alice@example.com",
  avatar_url: "https://avatars.example/alice.png"
};

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.href === "https://github.com/login/oauth/access_token") {
    return Response.json({ access_token: "gho_test", token_type: "bearer", scope: "read:user,user:email" });
  }
  if (url.href === "https://api.github.com/user") return Response.json(account);
  if (url.href === "https://api.github.com/user/emails") {
    return Response.json([{ email: account.email, primary: true, verified: true }]);
  }
  if (url.hostname === "127.0.0.1") return realFetch(input, init);
  throw new Error(`The compatibility spike attempted an unexpected network request to ${url.origin}${url.pathname}`);
};
