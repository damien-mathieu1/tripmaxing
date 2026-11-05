## Summary

<!-- What changed, in 1-3 bullets. -->

-

## Why

<!-- The problem or motivation. Link an issue if there is one. -->

## Test plan

<!-- Commands run, manual checks done. Be specific (build/typecheck/lint output, screenshots for UI). -->

- [ ] `pnpm typecheck` / `pnpm build` pass for touched packages
- [ ] `pnpm lint` / `pnpm exec oxfmt --check .` pass
- [ ] Manually verified in the app/browser (if user-facing)

## Checklist

- [ ] PR title follows Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`)
- [ ] Updated `docs/` if backend behavior changed
- [ ] Updated the OpenAPI spec if an API route changed
