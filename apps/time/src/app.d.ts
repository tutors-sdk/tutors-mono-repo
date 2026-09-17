// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	const APP_VERSION: string;
  
	namespace App {
	  // interface Error {}
	  interface Locals {
	    /** Correlation id set by the request logger hook; echoed as x-request-id. */
	    requestId?: string;
	  }
	  // interface PageData {}
	  // interface PageState {}
	  // interface Platform {}
	}
  }
  
  export {};
  