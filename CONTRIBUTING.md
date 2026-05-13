# Contributing

Thanks for considering a contribution to `bitcoin-node-scanner`.

## Getting started

```bash
git clone https://github.com/OriginalEveres/bitcoin-node-scanner.git
cd bitcoin-node-scanner
yarn install
yarn test
```

Node.js >= 22 is required.

## Workflow

1. Open an issue first for non-trivial changes so the design can be discussed
   before code is written.
2. Fork the repo and create a feature branch off `main`.
3. Make your change. Keep the diff focused on one thing.
4. Make sure these all pass locally before opening a PR:
   ```bash
   yarn lint
   yarn format:check
   yarn type-check
   yarn test
   ```
5. Open a PR against `main` with a short description of the change and the
   reasoning. Link any related issue.

CI runs the same checks on every PR, so a green local run is your best
predictor of a green PR.

## Code style

- TypeScript, strict mode. No `any`, no `@ts-ignore`.
- Prettier + ESLint enforce formatting and basic correctness; `yarn lint:fix`
  and `yarn format` handle most issues automatically.
- Prefer small, composable functions over deep classes.
- Add tests next to the code they cover, under a `tests/` folder
  (see `src/scanner/tests/` for the pattern).

## Tests

- Tests use Node's built-in test runner (`node:test`).
- Integration tests for handshake and crawler logic run against a local mock
  Bitcoin node (`src/handshake/mockBitcoinNode.ts`) — please do the same for
  network-edge changes rather than hitting public nodes.

## Commit messages

Short, imperative, lowercase: `fix: handle truncated version payload`,
`feat: add fee filter parsing`. The existing git history is a good reference.

## Using AI assistants / LLMs

AI-assisted contributions are welcome. If you use an LLM to draft code, you
are still responsible for the result: read it, understand it, run the tests,
and make sure it actually fits the codebase. PRs that are clearly unreviewed
LLM output (broken imports, fabricated APIs, irrelevant changes, tests that
don't run) will be closed. You don't need to disclose AI use.

## Reporting bugs

Open an issue with:
- What you ran (full command line).
- What you expected.
- What actually happened (output, stack trace).
- Environment: OS, Node version, package version or commit hash.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
