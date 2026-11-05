import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { planTrip } from "@/lib/trip/plan";
import type { Candidate } from "@/lib/trip/score";

const MAX_CANDIDATES = 5000;
const MAX_RADIUS_KM = 400;
const SUGGESTIONS_PER_STOP = 3;
const MAX_SUGGESTIONS = 16;
const Query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(MAX_RADIUS_KM).default(6),
  days: z.coerce.number().int().min(1).max(14).default(3),
  stops: z.coerce.number().int().min(2).max(10).default(6),
  offbeat: z.coerce.number().min(0).max(1).default(0.7),
  trending: z.coerce.number().min(0).max(1).default(0),
  maxWalkMinutes: z.coerce.number().int().min(15).max(480).optional(),
  suggest: z.enum(["1"]).optional(),
});

export async function GET(request: NextRequest) {
  const query = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return Response.json({ error: z.treeifyError(query.error) }, { status: 400 });
  const { lat, lon, radiusKm, days, stops, offbeat, trending, maxWalkMinutes, suggest } =
    query.data;

  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const sql = db();
  const candidates = await sql<Candidate[]>`
    select id, title, lang, family, langs, image, trend, views_recent as views,
      ST_Y(geom) as lat, ST_X(geom) as lon, coalesce(size, 0) as bytes
    from places
    where family is not null and views_recent is not null
      and geom && ST_MakeEnvelope(${lon - dLon}, ${lat - dLat}, ${lon + dLon}, ${lat + dLat}, 4326)
    -- A wide area holds more places than the limit: only the famous would survive a sort by views.
    order by ${offbeat >= 0.5 ? sql`random()` : sql`views_recent desc`}
    limit ${MAX_CANDIDATES}`;

  return Response.json({
    candidates: candidates.length,
    days: planTrip([...candidates], {
      days,
      offbeat,
      trending,
      maxWalkMinutes,
      suggest: suggest !== undefined,
      minStops: stops,
      stops: suggest ? Math.min(stops * SUGGESTIONS_PER_STOP, MAX_SUGGESTIONS) : stops,
    }),
  });
}
