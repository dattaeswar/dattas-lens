import sharp from "sharp";

export type Placement = "top" | "center" | "bottom";

export interface TextOverlay {
  title: string;
  subtitle?: string;
  placement?: Placement;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Composite crisp, correctly-spelled title/subtitle text over an AI-generated
 * background. Diffusion models garble lettering, so we render real vector text
 * with a legibility scrim instead of trusting the model to spell.
 */
export async function composeTitle(
  jpeg: Buffer,
  overlay: TextOverlay,
): Promise<Buffer> {
  const base = sharp(jpeg);
  const meta = await base.metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;

  const title = overlay.title.trim().slice(0, 40);
  const subtitle = (overlay.subtitle ?? "").trim().slice(0, 70);
  const placement = overlay.placement ?? "bottom";
  if (!title && !subtitle) return jpeg;

  const pad = Math.round(W * 0.07);

  // auto-fit the title to ~86% width (bold sans avg glyph ≈ 0.60·em)
  const maxTitleW = W * 0.86;
  const titleSize = Math.round(
    Math.max(
      W * 0.05,
      Math.min(W * 0.15, maxTitleW / Math.max(1, title.length * 0.6)),
    ),
  );
  const subSize = Math.round(Math.max(W * 0.022, titleSize * 0.34));

  const titleLine = title ? titleSize * 1.05 : 0;
  const subLine = subtitle ? subSize * 1.7 : 0;
  const blockH = titleLine + subLine;

  let blockTop: number;
  if (placement === "top") blockTop = pad;
  else if (placement === "center") blockTop = Math.round((H - blockH) / 2);
  else blockTop = Math.round(H - pad - blockH);

  const cx = Math.round(W / 2);
  const titleY = Math.round(blockTop + titleSize * 0.82);
  const subY = Math.round(blockTop + titleLine + subSize);

  // scrim band behind the text for legibility on any background
  const scrimH = Math.round(blockH + pad * 1.6);
  let scrimY: number;
  let gradStops: string;
  if (placement === "top") {
    scrimY = 0;
    gradStops = `<stop offset="0" stop-color="black" stop-opacity="0.62"/><stop offset="1" stop-color="black" stop-opacity="0"/>`;
  } else if (placement === "center") {
    scrimY = Math.round(blockTop - pad * 0.8);
    gradStops = `<stop offset="0" stop-color="black" stop-opacity="0"/><stop offset="0.5" stop-color="black" stop-opacity="0.5"/><stop offset="1" stop-color="black" stop-opacity="0"/>`;
  } else {
    scrimY = Math.round(H - scrimH);
    gradStops = `<stop offset="0" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity="0.7"/>`;
  }

  const titleSvg = title
    ? `<text x="${cx}" y="${titleY}" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="800" letter-spacing="${titleSize * 0.01}" fill="#ffffff" text-anchor="middle" filter="url(#sh)">${esc(title)}</text>`
    : "";
  const subSvg = subtitle
    ? `<text x="${cx}" y="${subY}" font-family="Georgia, 'Times New Roman', serif" font-size="${subSize}" font-style="italic" fill="#ffffff" text-anchor="middle" filter="url(#sh)">${esc(subtitle)}</text>`
    : "";

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">${gradStops}</linearGradient>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="${Math.round(titleSize * 0.03)}" stdDeviation="${Math.round(titleSize * 0.04)}" flood-color="black" flood-opacity="0.55"/>
    </filter>
  </defs>
  <rect x="0" y="${scrimY}" width="${W}" height="${scrimH}" fill="url(#scrim)"/>
  ${titleSvg}
  ${subSvg}
</svg>`;

  return base
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
