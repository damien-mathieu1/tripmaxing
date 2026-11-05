<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules

- Use components from `components/ui`. Do not restyle them with `className`, use their variants: `shadcn/no-restyle` is an error.
- Wikimedia limits are strict: never loop on its APIs outside `lib/ingest`, and always keep `Retry-After` persisted through `lib/ingest/blocks.ts`.
- User-facing text lives in `messages/fr.json`, read with `useTranslations`. Never hardcode it in components.
- Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before finishing a change.
