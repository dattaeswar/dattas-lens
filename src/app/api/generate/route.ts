import { NextRequest, NextResponse } from "next/server";
import { generateImage, ASPECT_RATIOS, AspectRatio } from "@/lib/nvidia";
import { STYLE_PRESETS } from "@/lib/styles";
import { saveImage } from "@/lib/store";
import { rateLimit } from "@/lib/ratelimit";
import { enhancePrompt, enhanceBackground } from "@/lib/llm";
import { composeTitle, Placement } from "@/lib/poster";

export const maxDuration = 120;

interface GenerateBody {
  prompt?: unknown;
  styleId?: unknown;
  aspectRatio?: unknown;
  seed?: unknown;
  steps?: unknown;
  enhance?: unknown;
  title?: unknown;
  subtitle?: unknown;
  placement?: unknown;
}

const PLACEMENTS: Placement[] = ["top", "center", "bottom"];

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

  let body: GenerateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (prompt.length > 2000) {
    return NextResponse.json(
      { error: "Prompt is too long (max 2000 characters)" },
      { status: 400 },
    );
  }

  const styleId = typeof body.styleId === "string" ? body.styleId : "none";
  const style = STYLE_PRESETS.find((s) => s.id === styleId);
  if (!style) {
    return NextResponse.json({ error: "Unknown style" }, { status: 400 });
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
  // FLUX.2 Klein is a distilled turbo model: steps 1-4, cfg is fixed at 1.
  const steps =
    typeof body.steps === "number" &&
    Number.isInteger(body.steps) &&
    body.steps >= 1 &&
    body.steps <= 4
      ? body.steps
      : undefined;

  // Optional crisp title text composited over the result (reliable typography).
  const title =
    typeof body.title === "string" ? body.title.trim().slice(0, 40) : "";
  const subtitle =
    typeof body.subtitle === "string" ? body.subtitle.trim().slice(0, 70) : "";
  const placement: Placement = PLACEMENTS.includes(body.placement as Placement)
    ? (body.placement as Placement)
    : "bottom";
  const hasTitle = title.length > 0;

  const enhance = body.enhance === true;

  try {
    // Build candidate prompts in priority order. generateImage retries seeds
    // for transient filter/blank failures; if a whole prompt keeps failing we
    // fall through to the next candidate. The AI-rewritten scene is the most
    // robust (raw "poster …, no text" prompts can render a blank canvas), so
    // it's always available as a fallback even when the user turned enhance off.
    const noText =
      "clean composition, no text, no letters, no words, no typography, no watermark";

    const buildEnhanced = () =>
      hasTitle ? enhanceBackground(prompt, placement) : enhancePrompt(prompt);
    const rawPrompt = hasTitle
      ? `${prompt}, clean poster background with generous empty space in the ${placement} area, no text, no letters, no words, no typography`
      : `${prompt}, ${noText}`;

    // "poster"/"flyer"-type prompts render as blank or garbled frames when sent
    // raw (the model fixates on the word "poster" and paints fake text), so we
    // always enhance them into a real scene first — even if the user toggled
    // enhance off. Literal subject prompts still honor the toggle.
    const posterish =
      /\b(poster|flyer|banner|brochure|billboard|cover|advert(isement)?|ad|leaflet|placard)\b/i.test(
        prompt,
      );
    const enhanceFirst = enhance || posterish || hasTitle;

    const candidates: string[] = [];
    if (enhanceFirst) {
      try {
        candidates.push(await buildEnhanced());
      } catch (err) {
        console.warn("[generate] enhance failed:", err);
      }
      candidates.push(rawPrompt);
    } else {
      candidates.push(rawPrompt);
      try {
        candidates.push(await buildEnhanced());
      } catch {
        /* fallback unavailable; rawPrompt still tried */
      }
    }

    let result: Awaited<ReturnType<typeof generateImage>> | null = null;
    let finalPrompt = prompt;
    let lastErr: unknown = new Error("Image generation failed");
    for (const candidate of candidates) {
      try {
        result = await generateImage({
          prompt: candidate + style.suffix,
          aspectRatio,
          seed,
          steps,
        });
        finalPrompt = candidate;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!result) throw lastErr;

    let base64 = result.base64;
    if (hasTitle) {
      const composed = await composeTitle(Buffer.from(base64, "base64"), {
        title,
        subtitle,
        placement,
      });
      base64 = composed.toString("base64");
    }

    const record = await saveImage(base64, {
      prompt,
      style: style.id,
      aspectRatio,
      seed: result.seed,
      ...(finalPrompt !== prompt ? { finalPrompt } : {}),
      ...(hasTitle ? { title, subtitle, source: "poster" } : {}),
    });

    return NextResponse.json({
      id: record.id,
      url: `/api/image/${record.id}`,
      seed: result.seed,
      prompt,
      finalPrompt: finalPrompt !== prompt ? finalPrompt : undefined,
      style: style.id,
      aspectRatio,
      title: hasTitle ? title : undefined,
      subtitle: hasTitle ? subtitle : undefined,
      createdAt: record.createdAt,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Image generation failed";
    console.error("[generate]", raw);
    return NextResponse.json({ error: friendlyError(raw) }, { status: 502 });
  }
}

/** Turn low-level errors into a message a user can act on. */
function friendlyError(raw: string): string {
  const m = raw.toLowerCase();
  if (
    m.includes("fetch failed") ||
    m.includes("terminated") ||
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("econnreset") ||
    m.includes("network")
  ) {
    return "Couldn't reach the image service — the connection dropped. Please try again.";
  }
  return raw;
}
