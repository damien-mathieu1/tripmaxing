// Loads every geolocated article in one pass. QLever answers in seconds what the
// Wikidata Query Service can only serve cell by cell.
import postgres from "postgres";
import { type PlaceRow, parsePlace } from "../lib/ingest/parse.ts";

const ENDPOINT = "https://qlever.dev/api/wikidata";
const BATCH = 5000;
const MAX_ATTEMPTS = 6;
// QLever cuts long responses: small areas stay well under what it delivers reliably.
const MAX_PLACES_PER_AREA = 60_000;
const PAUSE_MS = 1000;
const RETRY_SECONDS = 30;
// A few rows are skipped on purpose, like coordinates on other planets.
const MIN_COMPLETE = 0.98;
const PREFIXES = `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX schema: <http://schema.org/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>`;

const langs = (process.env.WIKI_LANGS ?? "fr,en").split(",").map((lang) => lang.trim());
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

async function fetchWithRetry(url: string) {
  for (let attempt = 1; ; attempt++) {
    let problem: string;
    let wait = attempt * RETRY_SECONDS;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/tab-separated-values",
          "User-Agent": process.env.WIKIMEDIA_USER_AGENT ?? "wikitrip/0.1",
        },
      });
      if (response.ok && response.body) return response;
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${response.status} from QLever`);
      }
      problem = `busy (${response.status})`;
      wait = Number(response.headers.get("Retry-After")) || wait;
    } catch (error) {
      // A public endpoint drops connections now and then. Real HTTP errors stop here.
      if (!(error instanceof TypeError)) throw error;
      problem = "unreachable";
    }
    if (attempt === MAX_ATTEMPTS) throw new Error(`QLever is ${problem}`);
    console.log(`QLever is ${problem}, waiting ${wait}s`);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  }
}

async function* lines(query: string) {
  const url = `${ENDPOINT}?${new URLSearchParams({ query: `${PREFIXES}\n${query}` })}`;
  const response = await fetchWithRetry(url);
  let rest = "";
  let header = true;
  const stream = response.body!.pipeThrough(new TextDecoderStream());
  for await (const chunk of stream as unknown as AsyncIterable<string>) {
    const parts = (rest + chunk).split("\n");
    rest = parts.pop() ?? "";
    for (const line of parts) {
      if (header) header = false;
      else if (line) yield line;
    }
  }
  if (rest) yield rest;
}

type Area = { west: number; east: number; south: number; north: number };

const WORLD: Area = { west: -180, east: 180.01, south: -90, north: 90.01 };

const inArea = ({ west, east, south, north }: Area) =>
  `FILTER(geof:longitude(?c) >= ${west} && geof:longitude(?c) < ${east} &&
    geof:latitude(?c) >= ${south} && geof:latitude(?c) < ${north})`;

async function countPlaces(wiki: string, area: Area) {
  const query = `SELECT (COUNT(DISTINCT ?i) AS ?n) WHERE {
    ?i wdt:P625 ?c . ${inArea(area)} ?a schema:about ?i ; schema:isPartOf <${wiki}> . }`;
  let count = 0;
  for await (const line of lines(query)) count = Number(/\d+/.exec(line)?.[0] ?? 0);
  await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  return count;
}

/** Halves the longest side until each area fits in one safe response. */
async function* areas(wiki: string, area: Area): AsyncGenerator<{ area: Area; expected: number }> {
  const expected = await countPlaces(wiki, area);
  if (!expected) return;
  if (expected <= MAX_PLACES_PER_AREA) {
    yield { area, expected };
    return;
  }
  const wide = area.east - area.west > area.north - area.south;
  const middle = wide ? (area.west + area.east) / 2 : (area.south + area.north) / 2;
  const halves: Area[] = wide
    ? [
        { ...area, east: middle },
        { ...area, west: middle },
      ]
    : [
        { ...area, north: middle },
        { ...area, south: middle },
      ];
  for (const half of halves) yield* areas(wiki, half);
}

async function importArea(
  lang: string,
  wiki: string,
  area: Area,
  labels: Map<string, string>,
  expected: number,
) {
  const query = `SELECT ?i ?title (SAMPLE(?c) AS ?coord) (SAMPLE(?l) AS ?links) (SAMPLE(?img) AS ?image)
      (GROUP_CONCAT(DISTINCT STR(?t); separator=" ") AS ?types) WHERE {
    ?i wdt:P625 ?c . ${inArea(area)} ?a schema:about ?i ; schema:isPartOf <${wiki}> ; schema:name ?title .
    ?i wikibase:sitelinks ?l . OPTIONAL { ?i wdt:P18 ?img } OPTIONAL { ?i wdt:P31 ?t }
  } GROUP BY ?i ?title`;
  // QLever can end a response early without any error: count, and start over if it did.
  for (let attempt = 1; ; attempt++) {
    let batch: PlaceRow[] = [];
    let total = 0;
    try {
      for await (const line of lines(query)) {
        const row = parsePlace(line, lang, labels);
        if (row) batch.push(row);
        if (batch.length === BATCH) {
          await save(batch);
          total += batch.length;
          batch = [];
        }
      }
    } catch (error) {
      if (!(error instanceof TypeError)) throw error; // the connection dropped mid-way
    }
    if (batch.length) await save(batch);
    total += batch.length;
    if (total >= expected * MIN_COMPLETE) return total;
    if (attempt === MAX_ATTEMPTS)
      throw new Error(`Incomplete area for ${lang}: ${total}/${expected}`);
    console.log(`${lang}: ${total} of ${expected}, retrying this area`);
    await new Promise((resolve) => setTimeout(resolve, attempt * RETRY_SECONDS * 1000));
  }
}

async function typeLabels(wiki: string, labels: Map<string, string>, labelLang: string) {
  const query = `SELECT ?t ?label WHERE {
    { SELECT DISTINCT ?t WHERE { ?i wdt:P625 ?c ; wdt:P31 ?t .
      ?a schema:about ?i ; schema:isPartOf <${wiki}> . } }
    ?t rdfs:label ?label . FILTER(LANG(?label) = "${labelLang}") }`;
  for await (const line of lines(query)) {
    const [type, label] = line.split("\t");
    const qid = /Q\d+/.exec(type)?.[0];
    if (qid && !labels.has(qid)) labels.set(qid, label.replace(/^"|"@\w+$/g, ""));
  }
}

async function save(rows: PlaceRow[]) {
  // A place can appear twice in a batch with several coordinates or titles.
  const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
  await sql`
    insert into places (id, lang, title, geom, langs, image, kind, family)
    select id, lang, title, ST_SetSRID(ST_MakePoint(lon, lat), 4326), langs, image, kind, family
    from jsonb_to_recordset(${sql.json(unique)}) as x(
      id int, lang text, title text, lon float8, lat float8, langs smallint,
      image text, kind smallint, family text)
    on conflict (id) do update set
      lang = excluded.lang, title = excluded.title, geom = excluded.geom, langs = excluded.langs,
      image = coalesce(places.image, excluded.image), kind = excluded.kind, family = excluded.family`;
}

// Least preferred first, so the preferred language overwrites the others.
for (const lang of [...langs].reverse()) {
  const wiki = `https://${lang}.wikipedia.org/`;
  const labels = new Map<string, string>();
  await typeLabels(wiki, labels, "fr");
  await typeLabels(wiki, labels, "en");
  console.log(`${lang}: ${labels.size} type labels`);

  let total = 0;
  for await (const { area, expected } of areas(wiki, WORLD)) {
    total += await importArea(lang, wiki, area, labels, expected);
    console.log(`${lang}: ${total} places`);
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
}

await sql`vacuum analyze places`;
await sql`reindex table places`;
const [{ places, size }] = await sql`
  select count(*)::int as places, pg_size_pretty(pg_total_relation_size('places')) as size from places`;
console.log(`${places} places, ${size}`);
await sql.end();
