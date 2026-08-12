import { z } from "zod";

export const publicEnvSchema = z.object({
  PUBLIC_SUPABASE_URL: z.string().url("PUBLIC_SUPABASE_URL must be a valid URL"),
  PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "PUBLIC_SUPABASE_ANON_KEY must not be empty"),
  PUBLIC_ANON_MODE: z.string().optional(),
  PUBLIC_party_kit_main_room: z.string().min(1, "PUBLIC_party_kit_main_room must not be empty")
});

export const privateEnvSchema = z.object({
  PRIVATE_AUTH_GITHUB_ID: z.string().min(1, "PRIVATE_AUTH_GITHUB_ID must not be empty"),
  PRIVATE_AUTH_GITHUB_SECRET: z.string().min(1, "PRIVATE_AUTH_GITHUB_SECRET must not be empty"),
  PRIVATE_AUTH_SECRET: z.string().min(32, "PRIVATE_AUTH_SECRET must be at least 32 characters")
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type PrivateEnv = z.infer<typeof privateEnvSchema>;

export function validatePublicEnv(env: Record<string, string>): PublicEnv {
  return publicEnvSchema.parse(env);
}

export function validatePrivateEnv(env: Record<string, string>): PrivateEnv {
  return privateEnvSchema.parse(env);
}
