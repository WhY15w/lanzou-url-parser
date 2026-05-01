<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

```bash
# Install (pnpm only - no npm/yarn)
pnpm install

# Dev server (http://localhost:3000)
pnpm run dev

# Lint
pnpm run lint

# Build for production
pnpm run build

# Start production server (after build)
pnpm start
```

There is no `typecheck` or `test` script. TypeScript errors are caught by the Next.js build / dev compilation, not a standalone `tsc` step.

## Stack & conventions

- **Next.js 16** / React 19 / TypeScript 5 — App Router only (no `pages/`)
- **Tailwind CSS v4** via `@tailwindcss/postcss`. Global styles use `@import "tailwindcss"` — not the legacy `@tailwind base/components/utilities` directives. Utility classes use modern `bg-linear-to-b`, `bg-red-900/20` etc.
- **pnpm** workspace root (not npm/yarn). `pnpm-workspace.yaml` ignores native deps `sharp` and `unrs-resolver` during install.
- **Path alias**: `@/*` maps to project root (`./*`) — configured in `tsconfig.json`

## Architecture

```
app/
  page.tsx                          "use client" — single-page UI
  layout.tsx                        metadata + root layout
  globals.css                       tailwind import + scrollbar styles
  api/parse/
    route.ts                        POST /api/parse — CORS enabled, calls parseLanzouUrl
    lanzou/
      lanzouParser.ts              core parse logic: multiple base URLs, password flow
      lanzouHttpClient.ts          axios wrapper with cookie persistence + acw_sc__v2 retry
      anti_acw_sc__v2.ts           cookie calculation for anti-bot challenge bypass
      types.ts                     shared type definitions
```

- The UI is a single `"use client"` component — no routing, no server components (besides the API route).
- The API route is **server-side only**: axios + cheerio scrape Lanzou cloud pages, bypass `acw_sc__v2` anti-bot cookies, and return a final download URL.
- The parser tries 5 base domains (`lanzoux.com`, `lanzouf.com`, `lanzouj.com`, `lanzouu.com`, `lanzouw.com`) and falls through on error.

## Gotchas

- **acw_sc__v2 cookie**: LANZOU returns a bot challenge HTML page containing an `arg1` value. The parser detects this inline, computes a cookie value via XOR with a fixed mask, then retries the request. If you modify the HTTP client, preserve the intercept/retry pattern.
- **Cookie isolation**: a fresh `createLanzouClient()` is called per parse request — cookies are not shared across requests.
- **Sharp/native deps**: `pnpm install` may warn about `sharp` and `unrs-resolver` (both used by Next.js internally). The workspace config silences these; they're not direct project dependencies.
