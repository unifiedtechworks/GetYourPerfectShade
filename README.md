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

Run the development server:

```bash
pnpm dev
```

Open `http://localhost:3000`.

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

Confirm the Node.js version selected in Amplify supports the installed Next.js version.

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
