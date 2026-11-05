export class RateLimited extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Rate limited for ${retryAfterSeconds}s`);
  }
}

const DEFAULT_RETRY_SECONDS = 300;

export async function fetchJson<T>(url: string, timeoutMs = 30_000) {
  const response = await fetch(url, {
    headers: { "User-Agent": process.env.WIKIMEDIA_USER_AGENT ?? "tripmaxing/0.1" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 429 || response.status === 503) {
    throw new RateLimited(Number(response.headers.get("Retry-After")) || DEFAULT_RETRY_SECONDS);
  }
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return (await response.json()) as T;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
