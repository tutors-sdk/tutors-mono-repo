import { createAuthClient } from "better-auth/client";
import type { IdentityClient } from "@tutors/identity";

function returnUrl(returnTo: string): string {
  const url = new URL(returnTo, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error("Identity return URL must use the reader's origin");
  return url.href;
}

export function createIdentityClient(): IdentityClient {
  const auth = createAuthClient({ basePath: "/api/auth" });
  return {
    async signIn(returnTo) {
      const result = await auth.signIn.social({ provider: "github", callbackURL: returnUrl(returnTo), errorCallbackURL: "/auth?error=denied" });
      if (result.error) throw new Error(result.error.message ?? "GitHub sign-in failed");
    },
    async signOut(returnTo) {
      const target = returnUrl(returnTo);
      const result = await auth.signOut();
      if (result.error) throw new Error(result.error.message ?? "Sign-out failed");
      window.location.assign(target);
    }
  };
}
