import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { KIND_IDS, type Kind, kindId } from "@/lib/places/kind";

const MAX_FEATURES = 5000;
// Pins per tile side: one winner per cell, so zoomed out maps stay readable.
const SPARSE_GRID = 8;
const DENSE_GRID = 4096;
const DENSE_ZOOM = 14;
// Popular places show first when zoomed out, every place shows from this zoom.
const ALL_PLACES_ZOOM = 12;
// Below this zoom, the places_popular partial index holds everything a tile can show.
const POPULAR_INDEX_ZOOM = 6;
// A world tile with a views filter would read every row, for 64 winners: a sample looks the same.
const SAMPLE_ZOOM = 4;
const SAMPLE_PERCENT = 3;

const Tile = z
  .object({
    z: z.coerce.number().int().min(0).max(22),
    x: z.coerce.number().int().min(0),
    y: z.coerce.number().int().min(0),
  })
  .refine(({ z, x, y }) => x < 2 ** z && y < 2 ** z);

const Filters = z.object({
  rising: z.enum(["1"]).optional(),
  minViews: z.coerce.number().int().min(0).optional(),
  maxViews: z.coerce.number().int().min(0).optional(),
  kinds: z
    .string()
    .transform((value) => value.split(",") as Kind[])
    .refine((kinds) => kinds.every((kind) => KIND_IDS.includes(kind)))
    .optional(),
});

export async function GET(request: NextRequest, context: RouteContext<"/api/tiles/[z]/[x]/[y]">) {
  const tile = Tile.safeParse(await context.params);
  const filters = Filters.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!tile.success || !filters.success) return new Response("Invalid tile", { status: 400 });
  const { z: zoom, x, y } = tile.data;
  const { rising, kinds, minViews, maxViews } = filters.data;
  const popularity = minViews !== undefined || maxViews !== undefined;
  const grid = zoom >= DENSE_ZOOM ? DENSE_GRID : SPARSE_GRID;

  const sql = db();
  const minimum = 2 ** Math.max(0, ALL_PLACES_ZOOM - zoom) - 1;
  const [row] = await sql<{ mvt: Uint8Array }[]>`
    with bounds as (
      select ST_TileEnvelope(${zoom}, ${x}, ${y}) as tile
    ),
    candidates as (
      select p.*, b.tile,
        coalesce(p.views_recent, 0) * least(greatest(coalesce(p.trend, 1), 0.5), 5) as heat
      from places p ${
        popularity && zoom <= SAMPLE_ZOOM
          ? sql`tablesample system (${SAMPLE_PERCENT}) repeatable (1)`
          : sql``
      }, bounds b
      where p.geom && ST_Transform(b.tile, 4326)
        ${rising ? sql`and p.trend >= 1.5 and p.views_recent >= 100` : sql``}
        ${minViews !== undefined ? sql`and p.views_recent >= ${minViews}` : sql``}
        ${maxViews !== undefined ? sql`and p.views_recent <= ${maxViews}` : sql``}
        ${
          rising || popularity || zoom >= ALL_PLACES_ZOOM
            ? sql``
            : sql`and p.views_recent >= ${minimum}`
        }
        ${
          !rising && !popularity && zoom <= POPULAR_INDEX_ZOOM
            ? sql`and p.views_recent >= 63`
            : sql``
        }
        ${kinds ? sql`and p.kind in ${sql(kinds.map(kindId))}` : sql``}
    ),
    winners as (
      select distinct on (cell_x, cell_y) *
      from (
        -- Plain maths: reprojecting every candidate through PostGIS costs seconds on world tiles.
        select c.*,
          floor(((ST_X(geom) + 180) / 360 * ${2 ** zoom} - ${x}) * ${grid}) as cell_x,
          floor(((1 - ln(tan(pi() / 4 + radians(greatest(-85, least(85, ST_Y(geom)))) / 2)) / pi()) / 2
            * ${2 ** zoom} - ${y}) * ${grid}) as cell_y
        from candidates c
      ) cells
      order by cell_x, cell_y, heat desc
    ),
    pins as (
      select ST_AsMVTGeom(ST_Transform(geom, 3857), tile, 4096, 64, true) as geom,
        id, title, lang, image, trend, family, coalesce(views_recent, 0) as views
      from winners
      order by heat desc
      limit ${MAX_FEATURES}
    )
    select ST_AsMVT(pins.*, 'places', 4096, 'geom') as mvt from pins`;

  return new Response(new Uint8Array(row.mvt), {
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
