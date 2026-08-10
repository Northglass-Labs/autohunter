import { z } from "zod";

const authEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export function getSupabaseAuthEnv() {
  return authEnvSchema.parse(process.env);
}
