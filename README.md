# ✳ Datta's Lens — AI Image Studio

A production-grade AI image generation SaaS. Type a sentence, get a finished
image in ~3 seconds — posters, product shots, concept art, logos and more —
or upload your own photo and reimagine it.

**Engine:** [FLUX.2 Klein 4B](https://build.nvidia.com) served on NVIDIA GPUs
via the NVIDIA API Catalog (NIM), with NVIDIA-hosted LLMs for prompt
enhancement and vision.
**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · sharp.

## Features

- ⚡ **~3 second generations** — FLUX.2 Klein on NVIDIA-hosted GPUs
- 🪄 **AI prompt enhancement** — an LLM rewrites your idea with pro art
  direction (accurate landmarks, richer lighting/composition)
- ✍️ **Crisp title text** — perfectly spelled headlines composited over the
  art with `sharp`, so posters never show garbled AI lettering
- 🖼️ **Upload & Reimagine** — a vision model studies your photo and recreates
  it with your requested change (color, style, medium, mood) applied
- 🎨 **12 style presets** — photoreal, cinematic, anime, poster, logo…
- 📐 **9 formats** (of 17 supported) — square, poster, banner, story, ultrawide
- 🖼️ **Batch mode** — up to 4 images per run, generated in parallel
- 🎲 **Seed control + remix** — lock a composition and iterate on it
- 🗂️ **Persistent gallery** with lightbox — every image saved with its metadata
- 🔒 **Server-side API key** · 🚦 **rate limiting** (10/min per IP)
- 📱 **Responsive** — single-column mobile, two-column desktop studio

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
open space, and the app typesets your real title/subtitle over it with `sharp`
(SVG → composite). Result: correct spelling, every time.

**Upload & Reimagine.** NVIDIA's shared endpoints reject arbitrary input images
(true img2img is gated). Instead, a vision LLM (`llama-3.2-11b-vision`) describes
your upload, merges in your change decisively, and FLUX regenerates the scene —
a faithful reinterpretation, not a pixel-exact edit (the UI says so).

**Robustness.** NVIDIA's safety checker false-positives often, so generation
retries up to 5× with fresh seeds. Prompts are capped to the model's 800-char
limit at a word boundary. Params respect the model's real ranges (steps 1–4,
cfg fixed at 1).

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # Landing page
│   ├── create/page.tsx           # Studio: Create + Reimagine tabs
│   ├── gallery/page.tsx          # Gallery with lightbox
│   └── api/
│       ├── generate/route.ts     # POST — validate, enhance, generate, compose text
│       ├── edit/route.ts         # POST — vision-describe upload + regenerate
│       ├── gallery/route.ts      # GET  — list all generations
│       └── image/[id]/route.ts   # GET/DELETE a single image
└── lib/
    ├── nvidia.ts                 # FLUX client (long-poll, retry, prompt cap)
    ├── llm.ts                    # prompt enhance / background / vision-edit
    ├── poster.ts                 # sharp SVG text compositing
    ├── store.ts                  # file-based image store (data/)
    ├── ratelimit.ts              # in-memory sliding-window limiter
    └── styles.ts                 # style preset definitions
```

Generated images are stored in `data/` (gitignored) as JPEG + a JSON index.

## Production notes

- **Persistent hosts** (VPS, Railway, Fly.io, Docker): works as-is —
  `npm run build && npm start`.
- **Serverless hosts** (Vercel, Netlify): the filesystem is ephemeral — swap
  `src/lib/store.ts` for Vercel Blob / S3 and the rate limiter for Upstash
  Redis. Both are isolated behind small interfaces.
- **Before charging customers:** add auth (Clerk/NextAuth), metered billing
  (Stripe), move rate limits to Redis, and queue the NVIDIA calls for bursts.
- **Rotate the API key** before any public launch.
