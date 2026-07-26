# Perfect Shade Website

Initial Phase 1 scaffold for `getyourperfectshade.com`, a modern Next.js website for Perfect Shade, a local window coverings business serving Hermiston, Boardman, Umatilla, Heppner, and surrounding communities in Umatilla and Morrow County.

## Tech Stack

- Next.js App Router
- TypeScript
- CSS Modules plus global CSS design tokens
- Static-generation-friendly routes
- SEO metadata, robots, sitemap, and LocalBusiness JSON-LD

## Local Development

Install dependencies:

```bash
pnpm install
```

pnpm and `pnpm-lock.yaml` are the canonical package-manager workflow for this repository.

Run the development server:

```bash
pnpm dev
```

Open `http://localhost:3000`.

The protected staff application also requires Supabase environment variables and the account
schema. See [`docs/local-development.md`](docs/local-development.md).

## Build

```bash
pnpm build
```

Preview a production build locally:

```bash
pnpm start
```

## AWS Amplify Notes

This project uses standard Next.js scripts and should be suitable for AWS Amplify Hosting. In Amplify, use:

- Build command: `pnpm build`
- Install command: `pnpm install`
- Output/framework preset: Next.js

Configure AWS Amplify to use Node.js 22.12 or newer, as required by the authentication and
test dependencies.

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
`NEXT_PUBLIC_SITE_URL` per Amplify environment. Architecture and authorization decisions are
documented in [`docs/account-architecture.md`](docs/account-architecture.md).

## Updating Business Info

Core business details live in:

- `data/business.ts`

Services and gallery categories live in:

- `data/services.ts`

## Replacing Placeholder Gallery Images

Placeholder image blocks are currently CSS-based and marked with comments in:

- `components/Hero.tsx`
- `components/GalleryCard.tsx`
- `components/GalleryDetailPage.tsx`

Future phases can replace these with real client photos using `next/image`, organized under `public/images/`.
