/// <reference types="@sveltejs/kit" />

import type { Actor } from "@tutors/identity";

declare global {
  const APP_VERSION: string;
  namespace App {
    // interface Error {}
    interface Locals {
      locale: string;
      /** Verified identity for this request, resolved by the server adapter. */
      actor: Actor | null;
      identityAdapter: "authjs" | "better-auth";
      /** Correlation id set by the request logger hook; echoed as x-request-id. */
      requestId?: string;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
