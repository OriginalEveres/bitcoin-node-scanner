# Agent guide

Instructions for AI coding agents working in this repo. Conventions that
aren't obvious from reading the code.

## Environment

- Node.js >= 22, TypeScript strict mode, ESM (`"type": "module"`).
- Package manager is **yarn**. `yarn.lock` is the canonical lockfile;
  `package-lock.json` must not be committed.

## Imports

- Module resolution is `nodenext`. Relative imports must use the `.js`
  extension even from `.ts` files (e.g. `import { foo } from "./bar.js"`).
- Public library surface is `src/index.ts`. When adding an exported symbol,
  re-export it from there.

## Project layout

- `src/` — published code. Treat as the public surface.
- `src/cli/crawl.ts` — CLI entrypoint, has a shebang, built to
  `dist/cli/crawl.js`.
- `src/**/tests/*.test.ts` — tests live in a `tests/` folder next to the code
  they cover.
- `src/handshake/mockBitcoinNode.ts` — local TCP server that simulates a
  Bitcoin node. Use it for integration tests; do **not** hit real public nodes
  from tests.
- `local-scripts/` — gitignored. Put one-off scripts, scratch experiments,
  and personal tools here. Excluded from `tsconfig`.
- `src/tor/` — bundled Tor support (fetch script, process supervisor, SOCKS5
  client) plus `mockSocks5Server.ts` for tests. `vendor/tor/` is gitignored
  and populated by `yarn fetch-tor`; tests must never depend on it or start a
  real `tor`.

## Style

- No `any`, no `@ts-ignore`, no `@ts-expect-error`.
- Unused parameters that exist for signature symmetry must be prefixed with
  `_` (e.g. `_d`). ESLint enforces this via `argsIgnorePattern: "^_"`.
- Prettier + ESLint are authoritative for formatting. Run `yarn format` and
  `yarn lint:fix` before hand-tweaking.
- Default to no comments. Only add one when the *why* is non-obvious.

## Tests

- Use the built-in `node:test` runner (no Jest, no Vitest).
- Run with `yarn test`. All 94+ existing tests must keep passing.
- Network-edge code (handshake, crawler) must be tested against
  `mockBitcoinNode`, not the real network.

## Before opening a PR

All four must pass locally — CI runs the same checks:

```bash
yarn lint
yarn format:check
yarn type-check
yarn test
```

## Commits

Short, imperative, lowercase, optionally Conventional-Commits-style prefix:
`fix: handle truncated version payload`, `feat: add fee filter parsing`,
`docs: ...`, `chore: ...`. Match the existing `git log` style.

## Out of scope without asking

- Adding new runtime dependencies.
- Switching test runner, build tool, or package manager.
- Network calls from tests.
- Touching `package.json` `bin` / `main` / `files` paths (they're set up for
  npm publishing — easy to break).
