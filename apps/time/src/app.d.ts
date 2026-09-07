// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	const APP_VERSION: string;
  
	namespace App {
	  // interface Error {}
	  // interface Locals {}
	  // interface PageData {}
	  // interface PageState {}
	  // interface Platform {}
	}
  }

// The GitHub login is the identity the educator check is made against
// (`enrollment.yaml` lists educators by login), so it has to survive the
// jwt → session hop. Mirrors the same augmentation in the reader.
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
