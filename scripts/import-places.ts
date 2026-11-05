// Loads every geolocated article in one pass. QLever answers in seconds what the
// Wikidata Query Service can only serve cell by cell.
import postgres from "postgres";
import { type PlaceRow, parsePlace } from "../lib/ingest/parse.ts";

const ENDPOINT = "https://qlever.dev/api/wikidata";
const BATCH = 5000;
const PREFIXES = `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX schema: <http://schema.org/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>`;

const langs = (process.env.WIKI_LANGS ?? "fr,en").split(",").map((lang) => lang.trim());
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

async function* lines(query: string) {
  const url = `${ENDPOINT}?${new URLSearchParams({ query: `${PREFIXES}\n${query}` })}`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/tab-separated-values",
      "User-Agent": process.env.WIKIMEDIA_USER_AGENT ?? "wikitrip/0.1",
    },
  });
  if (!response.ok || !response.body) throw new Error(`${response.status} from QLever`);
  let rest = "";
  let header = true;
  const stream = response.body.pipeThrough(new TextDecoderStream());
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

  const query = `SELECT ?i ?title (SAMPLE(?c) AS ?coord) (SAMPLE(?l) AS ?links) (SAMPLE(?img) AS ?image)
      (GROUP_CONCAT(DISTINCT STR(?t); separator=" ") AS ?types) WHERE {
    ?i wdt:P625 ?c . ?a schema:about ?i ; schema:isPartOf <${wiki}> ; schema:name ?title .
    ?i wikibase:sitelinks ?l . OPTIONAL { ?i wdt:P18 ?img } OPTIONAL { ?i wdt:P31 ?t }
  } GROUP BY ?i ?title`;
  let batch: PlaceRow[] = [];
  let total = 0;
  for await (const line of lines(query)) {
    const row = parsePlace(line, lang, labels);
    if (row) batch.push(row);
    if (batch.length === BATCH) {
      await save(batch);
      total += batch.length;
      batch = [];
      if (total % 100_000 === 0) console.log(`${lang}: ${total} places`);
    }
  }
  if (batch.length) await save(batch);
  console.log(`${lang}: ${total + batch.length} places`);
}

await sql`vacuum analyze places`;
await sql`reindex table places`;
const [{ places, size }] = await sql`
  select count(*)::int as places, pg_size_pretty(pg_total_relation_size('places')) as size from places`;
console.log(`${places} places, ${size}`);
await sql.end();
