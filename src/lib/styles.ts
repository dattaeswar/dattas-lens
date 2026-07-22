export interface StylePreset {
  id: string;
  label: string;
  emoji: string;
  suffix: string; // appended to the user's prompt
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: "none", label: "None", emoji: "✨", suffix: "" },
  {
    id: "photo",
    label: "Photoreal",
    emoji: "📷",
    suffix:
      ", ultra-realistic photograph, 85mm lens, natural lighting, sharp focus, high detail",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    emoji: "🎬",
    suffix:
      ", cinematic film still, dramatic volumetric lighting, anamorphic lens, film grain, moody color grade",
  },
  {
    id: "poster",
    label: "Poster",
    emoji: "🪧",
    suffix:
      ", bold graphic poster illustration, striking composition, flat modern vector style, rich color, clean open space, print-ready",
  },
  {
    id: "anime",
    label: "Anime",
    emoji: "🌸",
    suffix:
      ", anime illustration, vibrant colors, clean line art, studio-quality cel shading",
  },
  {
    id: "digital",
    label: "Digital Art",
    emoji: "🎨",
    suffix:
      ", polished digital painting, concept art, trending art station style, dramatic lighting",
  },
  {
    id: "3d",
    label: "3D Render",
    emoji: "🧊",
    suffix:
      ", high-quality 3D render, octane render, soft studio lighting, subsurface scattering, 4k",
  },
  {
    id: "neon",
    label: "Cyberpunk",
    emoji: "🌆",
    suffix:
      ", cyberpunk aesthetic, neon lights, rain-slicked streets, futuristic, high contrast",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    emoji: "🖌️",
    suffix:
      ", delicate watercolor painting, soft washes of color, textured paper, hand-painted",
  },
  {
    id: "minimal",
    label: "Minimal",
    emoji: "⚪",
    suffix:
      ", minimalist design, simple shapes, limited color palette, elegant negative space",
  },
  {
    id: "pixel",
    label: "Pixel Art",
    emoji: "👾",
    suffix: ", detailed pixel art, 16-bit retro game style, crisp pixels",
  },
  {
    id: "logo",
    label: "Logo",
    emoji: "🔷",
    suffix:
      ", professional logo design, flat vector emblem, simple memorable mark, white background",
  },
];
