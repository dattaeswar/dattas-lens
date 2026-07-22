import { NextRequest, NextResponse } from "next/server";
import { generateImage, ASPECT_RATIOS, AspectRatio } from "@/lib/nvidia";
import { describeAndModify } from "@/lib/llm";
import { saveImage } from "@/lib/store";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 60; // fits Vercel Hobby plan's function limit

// NVIDIA's shared trial endpoints reject arbitrary input images, so true
// img2img is unavailable. Instead a vision model studies the upload, writes a
// faithful recreation prompt with the requested change applied, and FLUX.2
// regenerates the scene.

interface EditBody {
  image?: unknown;
  instruction?: unknown;
  aspectRatio?: unknown;
  seed?: unknown;
}

const MAX_IMAGE_CHARS = 1_800_000; // ~1.3MB decoded; client resizes first

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Rate limit reached. Try again in ${limit.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: EditBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
    return NextResponse.json(
      { error: "image must be a base64 data URL (jpeg/png/webp)" },
      { status: 400 },
    );
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json(
      { error: "Image too large — please use a smaller photo" },
      { status: 413 },
    );
  }

  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return NextResponse.json(
      { error: "Tell me what to change" },
      { status: 400 },
    );
  }
  if (instruction.length > 1000) {
    return NextResponse.json(
      { error: "Instruction is too long (max 1000 characters)" },
      { status: 400 },
    );
  }

  const aspectRatio = (
    typeof body.aspectRatio === "string" ? body.aspectRatio : "1:1"
  ) as AspectRatio;
  if (!ASPECT_RATIOS.includes(aspectRatio)) {
    return NextResponse.json({ error: "Invalid aspect ratio" }, { status: 400 });
  }

  const seed =
    typeof body.seed === "number" && Number.isInteger(body.seed) && body.seed > 0
      ? body.seed
      : 0;

  try {
    const finalPrompt = await describeAndModify(image, instruction);
    const result = await generateImage({
      prompt: finalPrompt,
      aspectRatio,
      seed,
    });

    const record = await saveImage(result.base64, {
      prompt: instruction,
      style: "none",
      aspectRatio,
      seed: result.seed,
      finalPrompt,
      source: "edit",
    });

    return NextResponse.json({
      id: record.id,
      url: `/api/image/${record.id}`,
      seed: result.seed,
      prompt: instruction,
      finalPrompt,
      style: "none",
      aspectRatio,
      createdAt: record.createdAt,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Edit failed";
    console.error("[edit]", raw);
    const m = raw.toLowerCase();
    const message =
      m.includes("fetch failed") ||
      m.includes("terminated") ||
      m.includes("timed out") ||
      m.includes("timeout") ||
      m.includes("econnreset") ||
      m.includes("network")
        ? "Couldn't reach the image service — the connection dropped. Please try again."
        : raw;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
