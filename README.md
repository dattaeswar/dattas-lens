# ✳ Datta's Lens — AI Image Studio

A production AI poster & social-graphic generator. Type a sentence, get a
finished image in ~3 seconds — travel posters, event graphics, product
shots, concept art — with titles that are always spelled right.

**Engine:** [FLUX.2 Klein 4B](https://build.nvidia.com) served on NVIDIA GPUs
via the NVIDIA API Catalog (NIM), with an NVIDIA-hosted LLM for prompt
enhancement.
**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · sharp/satori · Vercel Blob.

## Features

- ⚡ **~3 second generations** — FLUX.2 Klein on NVIDIA-hosted GPUs
- 🪄 **AI prompt enhancement** — an LLM rewrites your idea with pro art
  direction (accurate landmarks, richer lighting/composition)
- ✍️ **Crisp title text** — perfectly spelled headlines composited over the
  art, so posters never show garbled AI lettering
- 🎨 **12 style presets** — photoreal, cinematic, anime, poster, logo…
- 📐 **9 formats** (of 17 supported) — square, poster, banner, story, ultrawide
- 🖼️ **Batch mode** — up to 4 images per run, generated in parallel
- 🎲 **Seed control + remix** — lock a composition and iterate on it
- 🗂️ **Persistent gallery** with lightbox — every image saved with its metadata
- 🔒 **Server-side API key** · 🚦 **rate limiting** (10/min per IP)
- 📱 **Responsive** — single-column mobile, two-column tablet/desktop studio

**Not this app's job:** editing your own photos (no true image-to-image;
generating photorealistic images of a real identifiable face also trips
NVIDIA's safety filters by design), exact real-world accuracy (logos,
landmarks, products — the model only knows visual descriptions, not real
names), or arbitrary in-scene text beyond the title overlay.

## Quick start

```bash
cp .env.example .env.local   # add your NVIDIA API key
npm install
npm run dev                  # http://localhost:3000
```

Get a free API key at [build.nvidia.com](https://build.nvidia.com) →
any FLUX model page → "Get API Key".

## How the hard parts work

**Reliable text on posters.** FLUX.2 Klein is a 4-step distilled model — fast,
but it garbles lettering (even "VENICE" comes out "VENCE"). So when you add a
title, the model is instructed to paint a *clean, text-free* background with
open space, and the app typesets your real title/subtitle over it separately
(satori → sharp composite). Result: correct spelling, every time.

**Robustness.** NVIDIA's safety checker false-positives often, so generation
retries up to 5× with fresh seeds. Prompts are capped to the model's 800-char
limit at a word boundary. Params respect the model's real ranges (steps 1–4,
cfg fixed at 1).

**Concurrent-safe storage on serverless.** Vercel's function filesystem is
read-only, so images are stored in Vercel Blob when `BLOB_READ_WRITE_TOKEN`
is set. Each image gets its own metadata blob (`meta/{id}.json`) rather than
one shared index — a shared index needs read-modify-write, which concurrent
serverless instances can't coordinate a lock around, so two simultaneous
generations could silently clobber each other's entry. Per-id files can't
collide since every id is unique.

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # Landing page
│   ├── create/page.tsx           # Studio
│   ├── gallery/page.tsx          # Gallery with lightbox
│   └── api/
│       ├── generate/route.ts     # POST — validate, enhance, generate, compose text
│       ├── gallery/route.ts      # GET  — list all generations
│       └── image/[id]/route.ts   # GET/DELETE a single image
└── lib/
    ├── nvidia.ts                 # FLUX client (long-poll, retry, prompt cap)
    ├── llm.ts                    # prompt enhancement
    ├── poster.tsx                # title-text compositing (satori + sharp)
    ├── store.ts                  # image store — fs (dev) or Vercel Blob (prod)
    ├── ratelimit.ts              # in-memory sliding-window limiter
    └── styles.ts                 # style preset definitions
```

Locally, generated images are stored in `data/` (gitignored) as JPEG + a JSON
index. In production, `BLOB_READ_WRITE_TOKEN` switches the store to Vercel Blob.

## Production notes

- **Persistent hosts** (VPS, Railway, Fly.io, Docker): works as-is —
  `npm run build && npm start`.
- **Serverless hosts** (Vercel, Netlify): set `BLOB_READ_WRITE_TOKEN` so
  `src/lib/store.ts` uses Vercel Blob instead of the local filesystem.
- **Before charging customers:** add auth (Clerk/NextAuth), metered billing
  (Stripe), move rate limits to Redis, and queue the NVIDIA calls for bursts.
- **Rotate the API key** before any public launch.
