/// <reference types="@sveltejs/kit" />

declare module "$env/static/public" {
  export const PUBLIC_SUPABASE_URL: string;
  export const PUBLIC_SUPABASE_ANON_KEY: string;
  export const PUBLIC_ANON_MODE: string;
  export const PUBLIC_party_kit_main_room: string;
}
