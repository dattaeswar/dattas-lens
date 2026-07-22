import sharp from "sharp";
import { fetchWithRetry } from "./http";

const INVOKE_URL =
  "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b";
const STATUS_URL = "https://ai.api.nvidia.com/v1/status";

export const ASPECT_RATIOS = [
  "9:21",
  "5:11",
  "1:2",
  "7:13",
  "3:5",
  "2:3",
  "3:4",
  "6:7",
  "1:1",
  "7:6",
  "4:3",
  "3:2",
  "5:3",
  "13:7",
  "2:1",
  "11:5",
  "21:9",
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export interface GenerateParams {
  prompt: string;
  aspectRatio: AspectRatio;
  seed?: number; // 0 or undefined = random
  steps?: number; // 1-4 (distilled model); cfg is fixed at 1 server-side
}

export interface GenerateResult {
  base64: string; // JPEG
  seed: number;
}

interface NvidiaArtifact {
  base64: string;
  finishReason: string;
  seed: number;
}

function apiKey(): string {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error("NVIDIA_API_KEY is not set. Add it to .env.local");
  }
  return key;
}

// FLUX.2 Klein rejects prompts over 800 chars; trim at a word boundary.
const MAX_PROMPT_CHARS = 800;
function capPrompt(prompt: string): string {
  if (prompt.length <= MAX_PROMPT_CHARS) return prompt;
  const slice = prompt.slice(0, MAX_PROMPT_CHARS);
  const cut = slice.lastIndexOf(" ");
  return (cut > 400 ? slice.slice(0, cut) : slice).trim();
}

/**
 * Invoke FLUX.2 Klein on NVIDIA's hosted API. Uses NVCF long-poll: the server
 * holds the request up to NVCF-POLL-SECONDS; if the job is still queued it
 * returns 202 with an Nvcf-Reqid we poll until fulfilled.
 */
export async function generateImage(
  params: GenerateParams,
  timeoutMs = 120_000,
): Promise<GenerateResult> {
  // NVIDIA's safety checker false-positives often, and the model sometimes
  // returns a near-blank canvas — both clear on a fresh seed, so retry.
  let filtered = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await invokeOnce(
        { ...params, seed: attempt === 0 ? params.seed : 0 },
        timeoutMs,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("CONTENT_FILTERED")) filtered = true;
      else if (message !== "DEGENERATE_BLANK") throw err;
    }
  }
  throw new Error(
    filtered
      ? "NVIDIA's safety filter blocked this prompt. Try different wording."
      : "The model kept returning a blank image for this prompt. Try rewording it.",
  );
}

async function invokeOnce(
  params: GenerateParams,
  timeoutMs: number,
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    prompt: capPrompt(params.prompt),
    aspect_ratio: params.aspectRatio,
    seed: params.seed ?? 0,
  };
  if (params.steps) body.steps = params.steps;

  const deadline = Date.now() + timeoutMs;

  let res = await fetchWithRetry(
    INVOKE_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "NVCF-POLL-SECONDS": "60",
      },
      body: JSON.stringify(body),
    },
    { retries: 3, timeoutMs },
  );

  // Job queued — poll the request id until it settles.
  while (res.status === 202) {
    const reqId = res.headers.get("nvcf-reqid");
    if (!reqId) throw new Error("NVIDIA returned 202 without a request id");
    if (Date.now() > deadline) throw new Error("Image generation timed out");
    res = await fetchWithRetry(
      `${STATUS_URL}/${reqId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          Accept: "application/json",
          "NVCF-POLL-SECONDS": "30",
        },
      },
      { retries: 3, timeoutMs: 45_000 },
    );
  }

  if (!res.ok) {
    let detail = `NVIDIA API error (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") detail = err.detail;
      else if (err.detail) detail = JSON.stringify(err.detail);
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new Error(detail);
  }

  const data = (await res.json()) as { artifacts?: NvidiaArtifact[] };
  const artifact = data.artifacts?.[0];
  if (artifact && artifact.finishReason === "CONTENT_FILTERED") {
    throw new Error("CONTENT_FILTERED");
  }
  if (!artifact?.base64) {
    throw new Error(
      `NVIDIA API returned no image (response: ${JSON.stringify(data).slice(0, 300)})`,
    );
  }
  if (artifact.finishReason && artifact.finishReason !== "SUCCESS") {
    throw new Error(`Generation finished with: ${artifact.finishReason}`);
  }

  // The model sometimes returns a washed-out / near-blank canvas (reported as
  // SUCCESS) — common when a "poster …, no text" prompt is read as an empty
  // poster. Low image entropy detects these reliably (real photos and art run
  // ~4-7; a near-blank frame is under ~3). Reject so the caller retries with a
  // fresh seed or falls back to another prompt.
  const buf = Buffer.from(artifact.base64, "base64");
  const stats = await sharp(buf).stats();
  if (stats.entropy < 3.2) throw new Error("DEGENERATE_BLANK");

  return { base64: artifact.base64, seed: artifact.seed };
}
