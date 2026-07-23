import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf6ee",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "#e2703a",
            color: "#fff",
            fontSize: 72,
            marginBottom: 32,
          }}
        >
          ✳
        </div>
        <div style={{ display: "flex", fontSize: 76, color: "#211d18", fontWeight: 700 }}>
          Datta&apos;s Lens
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#877e70", marginTop: 18 }}>
          AI image &amp; poster studio · powered by FLUX.2
        </div>
      </div>
    ),
    size,
  );
}
