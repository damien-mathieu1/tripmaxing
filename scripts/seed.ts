// Loads the Lyon data collected by the POC, so a fresh clone has pins without calling Wikimedia.
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { familyOf } from "../lib/places/family.ts";
import { kindId, kindOf } from "../lib/places/kind.ts";

type PocPage = {
  qid: string;
  title: string;
  lat: number;
  lon: number;
  langs: number;
  types: Record<string, string>;
  bytes?: number;
  views?: number;
  image?: string;
};

const { pages } = JSON.parse(
  readFileSync(new URL("../poc/lyon-fr.json", import.meta.url), "utf8"),
) as { pages: PocPage[] };
const rows = pages.map((page) => ({
  ...page,
  id: Number(page.qid.slice(1)),
  size: Math.min(page.bytes ?? 0, 32767),
  family: familyOf(page.types),
  kind: kindId(kindOf(page.types)),
}));
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await sql`
  insert into places (id, lang, title, image, geom, langs, size, family, kind, views_recent)
  select id, 'fr', title, image, ST_SetSRID(ST_MakePoint(lon, lat), 4326), langs, size, family, kind, views
  from jsonb_to_recordset(${sql.json(rows)}) as x(
    id int, title text, image text, lon float8, lat float8,
    langs smallint, size smallint, family text, kind smallint, views int)
  on conflict (id) do nothing`;
await sql.end();
console.log(`${rows.length} places loaded`);
