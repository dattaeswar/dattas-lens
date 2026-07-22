"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STYLE_PRESETS } from "@/lib/styles";

interface GalleryImage {
  id: string;
  url: string;
  prompt: string;
  finalPrompt?: string;
  style: string;
  aspectRatio: string;
  seed: number;
  createdAt: string;
  source?: string;
}

export default function GalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<GalleryImage | null>(null);

  useEffect(() => {
    fetch("/api/gallery")
      .then((r) => r.json())
      .then((d) => setImages(d.images ?? []))
      .finally(() => setLoaded(true));
  }, []);

  async function remove(id: string) {
    await fetch(`/api/image/${id}`, { method: "DELETE" });
    setImages((prev) => prev.filter((i) => i.id !== id));
    setSelected(null);
  }

  function styleLabel(id: string) {
    const s = STYLE_PRESETS.find((s) => s.id === id);
    return s ? `${s.emoji} ${s.label}` : id;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-display mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
        Gallery
      </h1>

      {loaded && images.length === 0 && (
        <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-line text-muted">
          <p className="mb-4 text-sm">Nothing here yet.</p>
          <Link
            href="/create"
            className="btn-accent rounded-full px-6 py-2.5 text-sm font-semibold"
          >
            Create your first image →
          </Link>
        </div>
      )}

      <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 [&>*]:mb-4">
        {images.map((img) => (
          <button
            key={img.id}
            onClick={() => setSelected(img)}
            className="card group block w-full overflow-hidden rounded-xl p-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={img.prompt}
              loading="lazy"
              className="w-full transition-transform group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {/* lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="card max-h-full w-full max-w-3xl overflow-auto rounded-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.url}
              alt={selected.prompt}
              className="mx-auto max-h-[65vh] rounded-xl"
            />
            <p className="mt-4 text-sm">{selected.prompt}</p>
            <p className="mt-1 text-xs text-muted">
              {selected.source === "edit"
                ? "🖼 Reimagined"
                : selected.source === "poster"
                  ? "✍️ Poster"
                  : styleLabel(selected.style)}{" "}
              · {selected.aspectRatio} · seed {selected.seed} ·{" "}
              {new Date(selected.createdAt).toLocaleString()}
            </p>
            {selected.finalPrompt && (
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer">🪄 AI-crafted prompt</summary>
                <p className="mt-1 leading-5">{selected.finalPrompt}</p>
              </details>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={selected.url}
                download={`dattas-lens-${selected.id}.jpg`}
                className="btn-accent rounded-lg px-4 py-2 text-sm font-medium"
              >
                Download
              </a>
              <Link
                href={`/create?prompt=${encodeURIComponent(selected.prompt)}`}
                className="pill rounded-lg px-4 py-2 text-sm"
              >
                Remix
              </Link>
              <button
                onClick={() => remove(selected.id)}
                className="pill ml-auto rounded-lg px-4 py-2 text-sm text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
