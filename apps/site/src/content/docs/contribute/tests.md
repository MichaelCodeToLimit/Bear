---
title: Tests
group: Contribute
order: 3
---

Please run the tests before you open a pull request.

## Unit tests

```bash
pnpm test
```

This runs Vitest across the repo. Unit tests sit next to the code they cover, in files ending `.test.ts`. If you fix a bug, add a test that fails without your fix.

## End-to-end tests

```bash
pnpm test:e2e
```

This builds the app, then uses Playwright to drive the **real Electron app**: it clicks, types and checks what appears on screen.

If `pnpm dev` is running at the same time, the two would fight over the same Electron files. Set the `BEAR_ELECTRON` environment variable to point at a separate `electron.exe`, and the tests will use that copy instead.

## Types

```bash
pnpm typecheck
```

## The website

The website has its own checks.

```bash
pnpm site:build        # build the site and its search index
pnpm site:test         # Playwright browser tests
```

Run `pnpm site:build` before `pnpm site:test`, because the tests run against the built site.

## Before you push

Run `pnpm test` and `pnpm test:e2e`, and make sure both pass.
