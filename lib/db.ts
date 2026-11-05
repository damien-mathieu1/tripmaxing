import postgres from "postgres";

const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  globalForDb.sql ??= postgres(process.env.DATABASE_URL, {
    max: 5,
    // Poolers in transaction mode, like Supabase on port 6543, cannot keep prepared statements.
    prepare: false,
  });
  return globalForDb.sql;
}
