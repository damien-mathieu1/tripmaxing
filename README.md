# wikitrip

Every geolocated Wikipedia article on a zoomable globe, and a trip engine that favours offbeat places.

## Stack

- Next.js on Vercel, shadcn/ui, MapLibre GL in globe mode
- Postgres + PostGIS, tiles generated on demand with `ST_AsMVT`
- Wikidata for places, Wikipedia for views, images and trends

## Run locally

Needs Node 24+, pnpm and Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3100. The seed loads Lyon, so you get pins without calling Wikimedia.

## Data pipeline

| Command                         | Job                                                                                       | Speed             |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ----------------- |
| `pnpm import:places`            | Every geolocated article of `WIKI_LANGS`, from QLever (a fast public Wikidata endpoint).  | A few minutes     |
| `pnpm import:views [new] [old]` | Views and trends for every place, streamed from monthly Wikimedia dumps. Nothing on disk. | About an hour     |
| `/api/cron/refresh`             | Walks the table by id for fresher views, images and article sizes, then starts over.      | ~350 per 45 s run |

`.github/workflows/import.yml` runs both imports monthly. `.github/workflows/cron.yml` calls the refresh every 15 minutes.

When Wikimedia asks to slow down, `Retry-After` is saved and honoured by later runs. Set `WIKIMEDIA_USER_AGENT` to something with a contact, as their policy requires.

Storage matters: `fr,en` is about 1.6 million places, around 240 bytes each, to fit a 500 MB free database. Article texts are not stored, the app reads them from Wikipedia on click. Adding a language adds rows.

## Map

Zoomed out, each tile keeps only the hottest place of each grid cell, based on views and trend. From zoom 14, every place shows. `/api/tiles/{z}/{x}/{y}` accepts `rising=1`, `minViews`, `maxViews` and `kinds=monument,museum,city,nature,event,transport,other`.

After changing `lib/places/kind.ts`, run `pnpm import:places` to reclassify stored places.

## Mobile

The app installs as a PWA. `public/sw.js` caches the shell and recent place tiles, but not base maps: those come from third-party servers and need a connection. The service worker only registers in production builds.

## Trips

"Créer un voyage" plans days around the map centre or the last search, then a walker follows real footpaths from the public OpenStreetMap foot router. Without that router, the trip falls back to straight lines and says so.

## Trip API

```bash
curl "localhost:3100/api/trips?lat=45.764&lon=4.8357&days=3&stops=6&offbeat=1"
```

| Parameter        | Default | Meaning                                  |
| ---------------- | ------- | ---------------------------------------- |
| `lat`, `lon`     |         | Centre of the trip                       |
| `radiusKm`       | 6       | Search radius                            |
| `days`           | 3       | Days, 1 to 14                            |
| `stops`          | 6       | Stops per day, 2 to 10                   |
| `offbeat`        | 0.7     | 0 famous places, 1 rare places           |
| `maxWalkMinutes` |         | Walking budget per day, 15 to 480        |
| `trending`       | 0       | 0 ignores trends, 1 favours rising pages |

Walking times are estimates, and a place may be closed or have nothing left to see.

## Deploy

1. Create a Supabase project and enable PostGIS.
2. Run the imports from your machine, with `DATABASE_URL` set to the Supabase direct connection:

   ```bash
   pnpm db:migrate
   pnpm import:places
   pnpm import:views
   ```

3. Import the repository in Vercel. Set `DATABASE_URL` to the transaction pooler (port 6543), plus `CRON_SECRET`, `WIKI_LANGS` and `WIKIMEDIA_USER_AGENT`.
4. In GitHub, set the `APP_URL` variable and the `CRON_SECRET` and `DATABASE_URL` secrets to enable refreshes and monthly imports.

## Contributing

Commits follow Conventional Commits. The pre-commit hook runs the audit, typecheck, tests, build, oxlint with `@shadcn/lint`, and oxfmt. CI runs the same checks.

`poc/` keeps the Python prototype and the Lyon dataset used by the seed.

## Credits

Text from Wikipedia (CC BY-SA), data from Wikidata (CC0). Maps by OpenFreeMap, OpenStreetMap, OpenTopoMap and EOX Sentinel-2 cloudless (CC BY-NC-SA, non-commercial).
