import { RUN_MS, authorized } from "@/lib/cron";
import { refresh } from "@/lib/ingest/refresh";

// Fits the Vercel Hobby limit: the queue simply continues on the next run.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await refresh(Date.now() + RUN_MS));
}
