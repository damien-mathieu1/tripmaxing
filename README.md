# tripmaxing

Every geolocated Wikipedia article on a zoomable globe, and a trip engine that favours offbeat places.

**Try it: [tripmaxing.dmathieu.dev](https://tripmaxing.dmathieu.dev)**

![tripmaxing demo: searching Lyon on the globe, opening a place, then planning a trip and following the walker along real footpaths](docs/demo.gif)

Zoom from space to a street corner: 1.6 million places, the most viewed or rising ones first, with their photo. Pick one to read about it, or let tripmaxing build a walking trip around a city with places tourists rarely see.

## Features

- Globe with satellite, road and topographic maps, country, region and department borders
- Pins for every geolocated article in `WIKI_LANGS`, thinned by popularity at each zoom level
- Filters by place type, popularity (niche to touristy) and rising articles
- Search any country, city or village
- Trip planner: perimeter, days, stops, walking budget, style and place types, then pick from suggestions
- Animated walker following real footpaths, one stop at a time
- Installable PWA, with trips saved on the device for offline use
- French interface, free, no account

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

## Scripts

| Command           | What it does                      |
| ----------------- | --------------------------------- |
| `pnpm dev`        | Start the dev server on port 3100 |
| `pnpm build`      | Production build                  |
| `pnpm test`       | Run tests with vitest             |
| `pnpm typecheck`  | Type-check with tsc               |
| `pnpm lint`       | Lint with oxlint + `@shadcn/lint` |
| `pnpm format`     | Format with oxfmt                 |
| `pnpm db:up`      | Start the local PostGIS database  |
| `pnpm db:migrate` | Create or update the schema       |
| `pnpm db:seed`    | Load the Lyon sample              |

## Data pipeline

| Command                         | Job                                                                                                    | Speed             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------- |
| `pnpm import:places`            | Every geolocated article of `WIKI_LANGS`, from QLever (a fast public Wikidata endpoint), area by area. | Up to a few hours |
| `pnpm import:views [new] [old]` | Views and trends for every place, streamed from monthly Wikimedia dumps. Nothing on disk.              | About an hour     |
| `/api/cron/refresh`             | Walks the table by id for fresher views, images and article sizes, then starts over.                   | ~350 per 45 s run |

`.github/workflows/cron.yml` calls the refresh every 15 minutes. `.github/workflows/import.yml` runs both imports monthly once enabled, see [Deploy](#deploy).

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

1. Create a Supabase project. In **Connect**, copy the session pooler URL (port 5432) and the transaction pooler URL (port 6543).
2. Create the schema with the session pooler URL. This also enables PostGIS:

   ```bash
   DATABASE_URL="<session pooler URL>" pnpm db:migrate
   ```

3. Fill the database. Run `pnpm import:places` and `pnpm import:views` with the same `DATABASE_URL`, or copy a database you already imported locally:

   ```bash
   docker compose exec -T db pg_dump -U tripmaxing --data-only --table=places tripmaxing | docker compose exec -T db psql "<session pooler URL>"
   ```

4. Import the repository in Vercel. Set `DATABASE_URL` to the transaction pooler URL, plus `CRON_SECRET`, `WIKI_LANGS` and `WIKIMEDIA_USER_AGENT`.
5. In GitHub, set the `APP_URL` variable and the `CRON_SECRET` secret to enable refreshes.
6. Optional: set the `ENABLE_IMPORT` variable to `true` and the `DATABASE_URL` secret (session pooler) to enable monthly imports. They rewrite the whole table, so the database can grow past 500 MB until the next vacuum.

## Contributing

Issues and pull requests are welcome.

`pnpm install` sets up the git hooks (husky):

- `pre-commit`: audit, typecheck, tests, build, then oxlint and oxfmt on staged files (lint-staged)
- `commit-msg`: commitlint, with [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `chore:`, ...)

CI runs the same checks. A few project rules:

- User-facing text lives in `messages/fr.json`, never in components
- Use the components of `components/ui` through their variants, `shadcn/no-restyle` is an error
- Wikimedia limits are strict: only call its APIs from `lib/ingest`, and keep `Retry-After` persisted

`poc/` keeps the Python prototype and the Lyon dataset used by the seed.

## Credits

Text from [Wikipedia](https://www.wikipedia.org) (CC BY-SA), photos from [Wikimedia Commons](https://commons.wikimedia.org) (each under its own license), data from [Wikidata](https://www.wikidata.org) (CC0), imported through [QLever](https://qlever.dev).

Maps by [OpenFreeMap](https://openfreemap.org), [OpenStreetMap](https://www.openstreetmap.org/copyright), [OpenTopoMap](https://opentopomap.org) and [EOX Sentinel-2 cloudless](https://s2maps.eu) (CC BY-NC-SA, non-commercial). Walking routes by the [FOSSGIS OSM routing service](https://routing.openstreetmap.de).

tripmaxing is an independent project with no official link to the Wikimedia Foundation.

## License

[MIT](LICENSE) for the code. The data and maps above keep their own licenses.
