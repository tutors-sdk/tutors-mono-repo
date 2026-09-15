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
  }
}

export {};
