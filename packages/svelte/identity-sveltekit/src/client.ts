import { signIn, signOut } from "@auth/sveltekit/client";
import type { IdentityClient } from "@tutors/identity";

export const identityClient: IdentityClient = {
  signIn: (returnTo) => signIn("github", { callbackUrl: returnTo }),
  signOut: (returnTo) => signOut({ callbackUrl: returnTo })
};
