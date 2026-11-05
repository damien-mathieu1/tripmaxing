import { db } from "../db";
import { block, isBlocked } from "./blocks";
import { trendOf } from "./parse.ts";
import { RateLimited, fetchJson, sleep } from "./wikimedia";

const BATCH = 50;
const WINDOW_DAYS = 30;
const MAX_SIZE = 32767;

type Page = {
  title: string;
  length?: number;
  pageimage?: string;
  pageviews?: Record<string, number | null>;
};
type Answer = {
  query?: { pages: Page[]; redirects?: { from: string; to: string }[] };
  continue?: Record<string, string>;
};

export function summarizeViews(pageviews: Record<string, number | null>) {
  const days = Object.keys(pageviews).sort();
  const sum = (keys: string[]) => keys.reduce((total, day) => total + (pageviews[day] ?? 0), 0);
  const recent = sum(days.slice(-WINDOW_DAYS));
  const previous = sum(days.slice(0, -WINDOW_DAYS));
  return { recent, trend: trendOf(recent, previous) };
}

/** Pageviews come back truncated per response: stopping before the end would read as zero views. */
async function fetchPages(lang: string, titles: string[]) {
  const pages = new Map<string, Page>();
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    formatversion: "2",
    titles: titles.join("|"),
    prop: "info|pageviews|pageimages",
    pvipdays: String(WINDOW_DAYS * 2),
    piprop: "name",
    pilimit: String(BATCH),
  };
  let cont: Record<string, string> | undefined = {};
  while (cont) {
    const query: string = new URLSearchParams({ ...params, ...cont }).toString();
    const answer: Answer = await fetchJson<Answer>(
      `https://${lang}.wikipedia.org/w/api.php?${query}`,
    );
    for (const page of answer.query?.pages ?? []) {
      const known = pages.get(page.title);
      pages.set(page.title, {
        ...known,
        ...page,
        pageviews: { ...known?.pageviews, ...page.pageviews },
      });
    }
    cont = answer.continue;
    await sleep(500);
  }
  return pages;
}

type Place = { id: number; lang: string; title: string };

/** Walks the table by id and starts over at the end: a queue that needs no index of its own. */
export async function refresh(deadline: number) {
  const sql = db();
  const [state] = await sql<{ value: string }[]>`
    select value from app_state where key = 'refresh_id'`;
  let cursor = Number(state?.value ?? 0);
  let places = 0;

  while (Date.now() < deadline) {
    const batch = await sql<Place[]>`
      select id, lang, title from places where id > ${cursor} order by id limit ${BATCH}`;
    if (!batch.length) {
      if (cursor === 0) return { status: "empty", places };
      cursor = 0;
      continue;
    }

    const rows = [];
    for (const lang of new Set(batch.map((place) => place.lang))) {
      const host = `${lang}.wikipedia.org`;
      if (await isBlocked(host)) return { status: "blocked", places };
      const articles = batch.filter((place) => place.lang === lang);
      let pages: Map<string, Page>;
      try {
        pages = await fetchPages(
          lang,
          articles.map((place) => place.title),
        );
      } catch (error) {
        if (!(error instanceof RateLimited)) throw error;
        await block(host, error.retryAfterSeconds);
        return { status: "blocked", places };
      }
      for (const { id, title } of articles) {
        const page = pages.get(title);
        const views = page?.pageviews ? summarizeViews(page.pageviews) : null;
        rows.push({
          id,
          size: page?.length === undefined ? null : Math.min(page.length, MAX_SIZE),
          image: page?.pageimage ?? null,
          recent: views?.recent ?? null,
          trend: views?.trend ?? null,
        });
      }
    }

    await sql`
      update places p set
        size = coalesce(x.size, p.size), image = coalesce(x.image, p.image),
        views_recent = coalesce(x.recent, p.views_recent), trend = coalesce(x.trend, p.trend)
      from jsonb_to_recordset(${sql.json(rows)}) as x(
        id int, size smallint, image text, recent int, trend real)
      where p.id = x.id`;
    cursor = batch[batch.length - 1].id;
    await sql`
      insert into app_state (key, value) values ('refresh_id', ${String(cursor)})
      on conflict (key) do update set value = excluded.value`;
    places += rows.length;
  }
  return { status: "paused", places };
}
