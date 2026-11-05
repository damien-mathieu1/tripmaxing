// Fills views and trends for every place from two monthly pageview dumps, without touching any API.
// Usage: pnpm import:views [recent month] [previous month], for example 2026-10 2026-09.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import postgres from "postgres";
import { parseViews, trendOf } from "../lib/ingest/parse.ts";

const BATCH = 5000;
// Rewriting every row at once would double the table: vacuum often so space gets reused.
const VACUUM_EVERY = 100_000;

function monthsAgo(count: number) {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - count);
  return date.toISOString().slice(0, 7);
}

const recentMonth = process.argv[2] ?? monthsAgo(1);
const previousMonth = process.argv[3] ?? monthsAgo(2);
if (![recentMonth, previousMonth].every((month) => /^\d{4}-\d{2}$/.test(month))) {
  throw new Error("Months look like 2026-10");
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const places = await sql<{ id: number; lang: string; title: string }[]>`
  select id, lang, title from places`;
const indexes = new Map(places.map((p, index) => [`${p.lang}.wikipedia ${p.title}`, index]));
const projects = [...new Set(places.map((place) => `${place.lang}.wikipedia`))].sort();
const lastProject = projects[projects.length - 1];
console.log(`${places.length} places in ${projects.join(", ")}`);

async function readMonth(month: string) {
  const views = new Uint32Array(places.length);
  const url =
    `https://dumps.wikimedia.org/other/pageview_complete/monthly/${month.slice(0, 4)}/${month}/` +
    `pageviews-${month.replace("-", "")}-user.bz2`;
  const curl = spawn(
    "curl",
    ["-sSfL", "-A", process.env.WIKIMEDIA_USER_AGENT ?? "tripmaxing", url],
    {
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const bzip = spawn("bzcat", { stdio: ["pipe", "pipe", "ignore"] });
  curl.stdout.pipe(bzip.stdin);
  bzip.stdin.on("error", () => {}); // bzcat goes away when we stop early
  let lines = 0;
  for await (const line of createInterface({ input: bzip.stdout })) {
    const { project, title, views: total } = parseViews(line);
    // The dump is sorted by project: nothing useful comes after the last one.
    if (project > lastProject) break;
    const index = indexes.get(`${project} ${title}`);
    if (index !== undefined) views[index] += total;
    if (++lines % 50_000_000 === 0) console.log(`${month}: ${lines} lines, at ${project}`);
  }
  curl.kill();
  bzip.kill();
  console.log(`${month}: done`);
  return views;
}

const recent = await readMonth(recentMonth);
const previous = await readMonth(previousMonth);

for (let start = 0; start < places.length; start += BATCH) {
  const rows = places.slice(start, start + BATCH).map((place, offset) => ({
    id: place.id,
    views: recent[start + offset],
    trend: trendOf(recent[start + offset], previous[start + offset]),
  }));
  await sql`
    update places p set views_recent = x.views, trend = x.trend
    from jsonb_to_recordset(${sql.json(rows)}) as x(id int, views int, trend real)
    where p.id = x.id`;
  if ((start + BATCH) % VACUUM_EVERY === 0) await sql`vacuum places`;
}

await sql`vacuum analyze places`;
// Updates leave indexes bloated, and this margin decides if the free tier is enough.
await sql`reindex table places`;
const [{ size }] = await sql`select pg_size_pretty(pg_total_relation_size('places')) as size`;
console.log(`views saved, table is ${size}`);
await sql.end();
