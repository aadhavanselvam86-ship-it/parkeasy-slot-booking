# ParkEasy – Car Parking Slot Booking System with AI Assistant

**Individual task title:** ParkEasy – Car Parking Slot Booking System with an Integrated AI Support Assistant

**Live site:** https://YOUR-PROJECT.vercel.app  ← replace after deploying
**Repository:** https://github.com/YOUR-USERNAME/parkeasy-slot-booking

## Features
| Requirement | Where |
|---|---|
| Responsive site, 5 pages + chat widget on every page | `public/*.html`, `public/site.js` (Home, Book a Slot, FAQ, Error Codes, Health) |
| Slot booking: availability map, overlap check, booking reference, lookup & cancel | `public/book.html`, `/api/slots`, `/api/bookings*` |
| 12 FAQs stored in SQL, shown on FAQ page | `faqs` table, `/api/faqs`, `/faq` |
| 8 error codes: 400, 401, 403, 404, 429, 500, 503, **PK-409** (slot already booked) | `error_codes` table, `/errors` |
| Custom 404 and 500 pages with "Ask the assistant" | `public/404.html`, `public/500.html` (try `/test-500`) |
| AI assistant: answers from FAQ data, explains error codes, creates a support ticket otherwise | `lib/assistant.js`, `/api/chat` |
| Support tickets in SQL; chat logs + feedback in MongoDB | `support_tickets` table; `chat_logs`, `feedback` collections |
| Secrets only in environment variables | `.env.example` (no real values committed; `.env` is git-ignored) |
| Request logging + health check page | logging middleware in `api/index.js`, `/health`, `/api/health` |
| Third-party API with time limit + fallback | Open-Meteo weather, 3-second `AbortController` timeout, cached/fallback message (`/api/weather`) |
| Rate limiting (429) | 60 API requests / minute / IP |

The assistant uses Claude (`ANTHROPIC_API_KEY`) restricted to the FAQ and error-code data, with an 8-second limit. Without a key or on failure it falls back to a built-in keyword matcher.

## Tech stack
Node.js + Express (Vercel serverless function), PostgreSQL (`pg`), MongoDB (`mongodb`), vanilla HTML/CSS/JS.

## Environment variables
| Name | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (e.g. Neon). Tables are created and seeded automatically. |
| `MONGODB_URI` / `MONGODB_DB` | MongoDB Atlas connection string / database name |
| `ANTHROPIC_API_KEY` | Optional – Claude API key for the assistant |
| `ADMIN_TOKEN` | Optional – required in `x-admin-token` header for `GET /api/tickets` |

If `DATABASE_URL` / `MONGODB_URI` are missing, the app uses an in-memory store (for local demos only).

## Run locally
```bash
npm install
cp .env.example .env   # fill in values
npm start              # http://localhost:3000
```

## Deploy (Vercel)
1. Push this repo to GitHub.
2. Vercel → Add New Project → import the repo (no build settings needed).
3. Add the environment variables above in Project Settings → Environment Variables, then redeploy.
4. Check `/health` shows SQL and MongoDB as OK, and that a wrong address (e.g. `/abc`) shows the custom 404 page.

## Proposed improvement
Add user accounts with secure login (e.g. OAuth or passwordless email links) and online payment via Stripe at booking time, so drivers can see all their bookings in one place and slots are only held once paid. A further step would be storing chat embeddings so the assistant can use semantic search over FAQs instead of keyword matching.
