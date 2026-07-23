import sharp from "sharp";
import { ImageResponse } from "next/og";

export type Placement = "top" | "center" | "bottom";

export interface TextOverlay {
  title: string;
  subtitle?: string;
  placement?: Placement;
}

/**
 * Composite crisp, correctly-spelled title/subtitle text over an AI-generated
 * background. Diffusion models garble lettering, so real text is rendered
 * separately and composited on top.
 *
 * The text layer is rendered with `next/og`'s ImageResponse (satori), which
 * bundles its own font — NOT with sharp's SVG text support, which resolves
 * fonts via the OS's fontconfig and renders blank/tofu glyphs on Vercel's
 * serverless containers (no system fonts installed there).
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

  const titleLine = title ? titleSize * 1.25 : 0;
  const subLine = subtitle ? subSize * 1.7 : 0;
  const blockH = Math.round(titleLine + subLine);

  let blockTop: number;
  if (placement === "top") blockTop = pad;
  else if (placement === "center") blockTop = Math.round((H - blockH) / 2);
  else blockTop = Math.round(H - pad - blockH);

  const scrimH = Math.round(blockH + pad * 1.6);
  let scrimY: number;
  let gradient: string;
  if (placement === "top") {
    scrimY = 0;
    gradient = "linear-gradient(to bottom, rgba(0,0,0,0.62), rgba(0,0,0,0))";
  } else if (placement === "center") {
    scrimY = Math.round(blockTop - pad * 0.8);
    gradient =
      "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.5), rgba(0,0,0,0))";
  } else {
    scrimY = Math.round(H - scrimH);
    gradient = "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.7))";
  }

  const textShadow = "0px 2px 10px rgba(0,0,0,0.6)";

  const overlayImage = new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: scrimY,
            width: W,
            height: scrimH,
            background: gradient,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: blockTop,
            width: W,
            height: blockH,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {title && (
            <div
              style={{
                display: "flex",
                fontSize: titleSize,
                fontWeight: 800,
                color: "#ffffff",
                textAlign: "center",
                lineHeight: 1,
                textShadow,
              }}
            >
              {title}
            </div>
          )}
          {subtitle && (
            <div
              style={{
                display: "flex",
                fontSize: subSize,
                fontStyle: "italic",
                color: "#ffffff",
                textAlign: "center",
                marginTop: Math.round(subSize * 0.4),
                textShadow,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
    ),
    { width: W, height: H },
  );
  const overlayPng = await overlayImage.arrayBuffer();

  return base
    .composite([{ input: Buffer.from(overlayPng), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
