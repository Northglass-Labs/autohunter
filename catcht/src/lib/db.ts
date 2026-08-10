import "server-only";
import postgres from "postgres";
import { getCoreEnv } from "./env";
import { databaseSslOptions } from "./db-ssl";

let client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!client) {
    const env = getCoreEnv();
    if (env.DATABASE_SSL_MODE === "disable" && process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_SSL_MODE=disable is only allowed for local development");
    }
    client = postgres(env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
      ssl: databaseSslOptions(env.DATABASE_CA_CERT, env.DATABASE_SSL_MODE),
    });
  }
  return client;
}
