# Perfect Shade Repository Guidance

This repository contains the public-facing Perfect Shade website. Treat the public website as a distinct product area from any future authenticated account or estimate-building application.

## Public Website Ownership

The public-site owner is responsible for:

- Public homepage
- Products Offered pages
- Product detail pages
- About and contact pages
- Public header, footer, and navigation
- Marketing-specific components and styling
- Public product data and product imagery
- SEO and public metadata
- Desktop and mobile public user experience
- Public accessibility, responsive behavior, and static prerendering where supported

Preserve the current public UX foundation unless a task explicitly asks to change it:

- Previous Product / Next Product navigation
- Full-card semantic product links
- Product supporting image galleries
- Cormorant Garamond-first heading typography
- Current responsive and accessibility behavior
- Static prerendering for public routes

## Boundary With Future Account Application

A separate workstream owns authentication, accounts, protected application areas, customer records, and the future web-based bid or estimate system.

Do not implement or make architectural decisions for:

- Authentication or registration
- Account dashboards
- Customer management
- Database models
- Protected routes
- Estimate or bid-builder functionality
- Middleware or auth guards for protected application behavior

Do not reorganize the repository in ways that would make it difficult to introduce separate public, authentication, and protected application areas later.

## Shared And Foundational Files

Before modifying shared or foundational files, explain why the change is necessary and note the possible effect on the future account application.

Likely shared or foundational files include:

- `app/layout.tsx`
- `app/globals.css`
- `data/business.ts`
- `app/robots.ts`
- `app/sitemap.ts`
- Root providers, middleware, environment configuration, deployment configuration, and dependency manifests

Keep marketing-specific design assumptions inside public or marketing components. Do not place public-site styling assumptions into generic shared components intended for future application use.

## Public Route Stability

Do not rename, remove, or relocate public routes without explaining the integration and SEO impact first.

Current public route structure:

- `/`
- `/about`
- `/contact`
- `/gallery`
- `/gallery/window-coverings`
- `/gallery/exterior-solutions`
- `/robots.txt`
- `/sitemap.xml`

## Product And Brand Constraints

Preserve existing uncommitted product data and supporting-image work unless a task explicitly asks to change it.

Do not reintroduce Window Films, Shutters, or public manufacturer names unless the business direction changes and the user explicitly requests it.

Keep Perfect Shade's public brand direction warm, polished, local, and interior-design oriented.

## Verification Expectations

For public-site work, run lint, type checks, production builds, and responsive browser checks as appropriate for the risk of the change.

At the end of each task, clearly separate:

- Public-area files changed
- Shared or foundational files changed
- Potential integration considerations for the account-system thread
