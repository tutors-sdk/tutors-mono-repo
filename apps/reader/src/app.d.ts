/// <reference types="@sveltejs/kit" />

declare global {
  const APP_VERSION: string;
  namespace App {
    // interface Error {}
    interface Locals {
      locale: string;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

declare module "@auth/core/types" {
  interface User {
    login?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    login?: string;
    /**
     * The user's GitHub OAuth access token (issue #155). Server-only; never
     * returned to the client via `locals.auth()` / the `session` callback.
     */
    access_token?: string;
  }
}

export {};
