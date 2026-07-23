import { fetchWithRetry } from "./http";

const CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const ENHANCE_MODEL = "meta/llama-3.1-8b-instruct";

function apiKey(): string {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set. Add it to .env.local");
  return key;
}

async function chat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  timeoutMs = 60_000,
): Promise<string> {
  const res = await fetchWithRetry(
    CHAT_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.4,
      }),
    },
    { retries: 2, timeoutMs },
  );
  if (!res.ok) {
    throw new Error(`LLM error (HTTP ${res.status})`);
  }
  const data = await res.json();
  const text: unknown = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("LLM returned empty response");
  }
  return text.trim();
}

const ENHANCE_SYSTEM = `You are a prompt engineer for the FLUX image generation model. FLUX renders beautiful imagery but (1) CANNOT render legible text and (2) does NOT recognize places, people or products by name — it only understands VISUAL DESCRIPTIONS.

Rewrite the user's idea into one vivid image prompt describing artwork only.

Rules:
- Ignore conversational framing ("give me…", "show me…", "a description of…") and turn it into a concrete visual scene of the subject.
- Choose ONE clear focal subject and build the whole image around it. Do NOT list several landmarks or ideas — a list makes the model blend them into a vague mush. One hero subject, richly described.
- For a real place, identify its single MOST ICONIC landmark and describe its distinctive physical appearance in concrete detail — overall shape, structure, materials, colour, and defining features — so the model renders it recognizably WITHOUT relying on the name. (e.g. for Hyderabad → the Charminar: a grand square monument of granite and lime, four tall fluted minarets with onion-domed tops at its corners, four soaring pointed arches, warm sandstone tone.)
- Add composition, lighting, colour palette, mood and medium/style. Favour a specific camera angle and time of day.
- The image must contain NO text: never describe words, titles, signs, labels, logos, captions or watermarks. Treat "poster/flyer/cover/banner" as a striking poster-style image with bold composition and clean open space — but NO lettering.
- End the prompt with: no text, no letters, no words, no typography, no watermark.
- One paragraph, under 90 words, no preamble, no quotes, no explanations. Output the prompt only.`;

/** Rewrite a raw user idea into a detailed FLUX prompt. Throws on failure. */
export async function enhancePrompt(userPrompt: string): Promise<string> {
  const out = await chat(
    ENHANCE_MODEL,
    [
      { role: "system", content: ENHANCE_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    250,
  );
  // strip surrounding quotes some models add
  return out.replace(/^["'`]+|["'`]+$/g, "").trim();
}

const BG_SYSTEM = `You are a prompt engineer for the FLUX image generation model. The user is making a poster whose title text will be added afterwards by a separate typesetting step, so the IMAGE ITSELF MUST CONTAIN NO TEXT.

Rewrite the user's idea into one vivid image prompt describing only the artwork/scene: subject, composition, lighting, color palette, mood, medium. Keep the user's subject and intent exactly, and depict any real place or object with authentic, recognizable, accurate detail (correct landmarks, architecture, natural features and colors).

The composition MUST leave generous clean empty negative space in the {PLACEMENT} region of the frame for a title to be placed later. End the prompt with: no text, no letters, no words, no typography, no watermark.

One paragraph, under 65 words, no preamble, no quotes, output the prompt only.`;

/** Enhance a scene into a clean, text-free poster background with space for a title. */
export async function enhanceBackground(
  userPrompt: string,
  placement: string,
): Promise<string> {
  const region =
    placement === "top"
      ? "upper"
      : placement === "center"
        ? "central"
        : "lower";
  const out = await chat(
    ENHANCE_MODEL,
    [
      { role: "system", content: BG_SYSTEM.replace("{PLACEMENT}", region) },
      { role: "user", content: userPrompt },
    ],
    250,
  );
  return out.replace(/^["'`]+|["'`]+$/g, "").trim();
}
