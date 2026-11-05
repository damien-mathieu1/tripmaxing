import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const MAX_IDS = 10;
const Ids = z
  .string()
  .regex(/^\d+(,\d+)*$/)
  .transform((value) => value.split(",").map(Number))
  .refine((ids) => ids.length <= MAX_IDS);

export async function GET(request: NextRequest) {
  const ids = Ids.safeParse(request.nextUrl.searchParams.get("ids"));
  if (!ids.success) return new Response("Invalid ids", { status: 400 });
  const sql = db();
  const places = await sql`
    select id, ST_Y(geom) as lat, ST_X(geom) as lon from places where id in ${sql(ids.data)}`;
  return Response.json(places);
}
