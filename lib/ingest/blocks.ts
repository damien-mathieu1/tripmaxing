import { db } from "../db";

export async function isBlocked(host: string) {
  const sql = db();
  const rows = await sql`select 1 from api_blocks where host = ${host} and until > now()`;
  return rows.length > 0;
}

/** Wikimedia can ask for long pauses: persist them so the next cron run honours them too. */
export async function block(host: string, seconds: number) {
  const sql = db();
  await sql`
    insert into api_blocks (host, until) values (${host}, now() + ${seconds} * interval '1 second')
    on conflict (host) do update set until = excluded.until`;
}
