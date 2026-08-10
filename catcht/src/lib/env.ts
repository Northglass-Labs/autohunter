import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_CA_CERT: z.string().optional(),
  DATABASE_SSL_MODE: z.enum(["verify-full", "disable"]).default("verify-full"),
  ACTION_SIGNING_SECRET: z.string().min(24),
  APP_URL: z.string().url(),
});

export function getCoreEnv() {
  const env = serverEnvSchema.parse(process.env);
  const appUrl = new URL(env.APP_URL);
  const originOnly = appUrl.username === "" && appUrl.password === ""
    && appUrl.pathname === "/" && appUrl.search === "" && appUrl.hash === "";
  if (!originOnly || (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:")) {
    throw new Error("APP_URL must be a credential-free HTTPS origin in production");
  }
  return { ...env, APP_URL: appUrl.origin };
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
