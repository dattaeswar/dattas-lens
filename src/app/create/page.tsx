"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { STYLE_PRESETS } from "@/lib/styles";

interface GeneratedImage {
  id: string;
  url: string;
  seed: number;
  prompt: string;
  finalPrompt?: string;
  style: string;
  aspectRatio: string;
  createdAt: string;
  title?: string;
  subtitle?: string;
}

const RATIO_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "1:1", label: "1:1", hint: "Square" },
  { value: "4:3", label: "4:3", hint: "Classic" },
  { value: "3:2", label: "3:2", hint: "Photo" },
  { value: "2:1", label: "2:1", hint: "Wide" },
  { value: "21:9", label: "21:9", hint: "Banner" },
  { value: "3:4", label: "3:4", hint: "Portrait" },
  { value: "2:3", label: "2:3", hint: "Poster" },
  { value: "1:2", label: "1:2", hint: "Tall" },
  { value: "9:21", label: "9:21", hint: "Story" },
];

function ratioToCss(r: string): string {
  const [w, h] = r.split(":").map(Number);
  return `${w} / ${h}`;
}

function nearestRatio(w: number, h: number): string {
  const target = w / h;
  let best = "1:1";
  let bestDiff = Infinity;
  for (const opt of RATIO_OPTIONS) {
    const [rw, rh] = opt.value.split(":").map(Number);
    const diff = Math.abs(rw / rh - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = opt.value;
    }
  }
  return best;
}

/** Downscale an uploaded file to ≤1280px JPEG data URL (keeps API payloads small). */
function fileToDataUrl(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.82), w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}

function StudioInner() {
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<"create" | "edit">("create");

  // create state
  const [prompt, setPrompt] = useState(
    () => searchParams.get("prompt") ?? "",
  );
  const [enhance, setEnhance] = useState(true);
  const [styleId, setStyleId] = useState("none");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [count, setCount] = useState(1);
  const [seed, setSeed] = useState<string>("");
  const [steps, setSteps] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // crisp composited title text (optional)
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [placement, setPlacement] = useState<"top" | "center" | "bottom">(
    "bottom",
  );
  const [showTitle, setShowTitle] = useState(false);

  // edit state
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadRatio, setUploadRatio] = useState("1:1");
  const [instruction, setInstruction] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // shared state
  const [busy, setBusy] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/gallery");
      const data = await res.json();
      setHistory(data.images ?? []);
    } catch {
      // gallery is non-critical; ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gallery")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setHistory(data.images ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const { dataUrl, w, h } = await fileToDataUrl(file);
      setUploadedImage(dataUrl);
      setUploadRatio(nearestRatio(w, h));
      setErrors([]);
    } catch (err) {
      setErrors([(err as Error).message]);
    }
  }

  async function generate() {
    if (busy) return;
    if (mode === "create" && !prompt.trim()) return;
    if (mode === "edit" && (!uploadedImage || !instruction.trim())) return;

    setBusy(true);
    setErrors([]);
    setResults([]);
    const runs = mode === "create" ? count : 1;
    setPendingCount(runs);

    const seedNum = seed ? parseInt(seed, 10) : 0;

    const makeRequest = (i: number) => {
      if (mode === "edit") {
        return fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: uploadedImage,
            instruction: instruction.trim(),
            aspectRatio: uploadRatio,
          }),
        });
      }
      return fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          styleId,
          aspectRatio,
          enhance,
          // when a seed is locked, offset per batch item so images differ
          seed: seedNum > 0 ? seedNum + i : 0,
          steps: steps ? parseInt(steps, 10) : undefined,
          title: showTitle ? title.trim() : "",
          subtitle: showTitle ? subtitle.trim() : "",
          placement,
        }),
      });
    };

    const tasks = Array.from({ length: runs }, (_, i) =>
      makeRequest(i)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setResults((prev) => [...prev, data as GeneratedImage]);
        })
        .catch((err: Error) => {
          setErrors((prev) => [...prev, err.message]);
        })
        .finally(() => setPendingCount((prev) => prev - 1)),
    );

    await Promise.all(tasks);
    setBusy(false);
    loadHistory();
  }

  function remix(img: GeneratedImage) {
    setMode("create");
    setPrompt(img.prompt);
    setStyleId(
      STYLE_PRESETS.some((s) => s.id === img.style) ? img.style : "none",
    );
    setAspectRatio(img.aspectRatio);
    setSeed(String(img.seed));
    setShowAdvanced(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeImage(id: string) {
    await fetch(`/api/image/${id}`, { method: "DELETE" });
    setResults((prev) => prev.filter((r) => r.id !== id));
    setHistory((prev) => prev.filter((r) => r.id !== id));
  }

  const canGenerate =
    mode === "create"
      ? prompt.trim().length > 0
      : Boolean(uploadedImage) && instruction.trim().length > 0;

  const resultRatio = mode === "create" ? aspectRatio : uploadRatio;

  const wantsText =
    /\b(poster|flyer|banner|title|text|caption|headline|sign|logo|cover|quote|slogan|words?)\b/i.test(
      prompt,
    );

  const inputCls =
    "w-full rounded-xl card px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-accent";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-display mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
        Studio
      </h1>

      {/* mode tabs */}
      <div className="mb-7 flex w-full max-w-sm rounded-full border border-line bg-surface p-1 text-sm font-medium">
        <button
          onClick={() => setMode("create")}
          className={`flex-1 rounded-full py-2 transition-colors ${
            mode === "create" ? "bg-accent text-white" : "text-muted hover:text-foreground"
          }`}
        >
          ✳ Create
        </button>
        <button
          onClick={() => setMode("edit")}
          className={`flex-1 rounded-full py-2 transition-colors ${
            mode === "edit" ? "bg-accent text-white" : "text-muted hover:text-foreground"
          }`}
        >
          🖼 Reimagine
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
        {/* ---------- controls ---------- */}
        <div className="space-y-6">
          {mode === "create" ? (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                      generate();
                  }}
                  rows={4}
                  placeholder="A travel poster for Kashmir — snow peaks, a shikara on Dal Lake, autumn chinar trees…"
                  className={`${inputCls} resize-none`}
                />
                <div className="mt-2 flex items-center justify-between">
                  <button
                    onClick={() => setEnhance(!enhance)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      enhance ? "pill-active pill" : "pill"
                    }`}
                    title="An AI rewrites your idea with richer art direction"
                  >
                    🪄 AI enhance {enhance ? "on" : "off"}
                  </button>
                  <p className="text-xs text-muted">Ctrl+Enter to generate</p>
                </div>
                {wantsText && !showTitle && (
                  <button
                    onClick={() => {
                      setShowTitle(true);
                      titleRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                    className="mt-2 w-full rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-left text-xs leading-5 text-foreground"
                  >
                    💡 Looks like you want a poster with words. The AI can&apos;t
                    spell reliably — <b>tap here to add crisp title text</b>{" "}
                    instead.
                  </button>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Style</label>
                <div className="flex flex-wrap gap-2">
                  {STYLE_PRESETS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStyleId(s.id)}
                      className={`pill rounded-full px-3 py-1.5 text-xs ${
                        styleId === s.id ? "pill-active" : ""
                      }`}
                    >
                      {s.emoji} {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {RATIO_OPTIONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setAspectRatio(r.value)}
                      className={`pill flex flex-col items-center rounded-xl px-2 py-2.5 text-xs ${
                        aspectRatio === r.value ? "pill-active" : ""
                      }`}
                    >
                      <span
                        className="mb-1.5 block w-5 rounded-[3px] border border-current opacity-70"
                        style={{ aspectRatio: ratioToCss(r.value) }}
                      />
                      {r.label}
                      <span className="opacity-60">{r.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* crisp title text overlay */}
              <div
                ref={titleRef}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <label className="flex cursor-pointer items-center justify-between">
                  <span className="text-sm font-medium">
                    ✍️ Add title text{" "}
                    <span className="font-normal text-muted">
                      — perfectly spelled
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={showTitle}
                    onChange={(e) => setShowTitle(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                </label>
                {showTitle && (
                  <div className="mt-3 space-y-3">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value.slice(0, 40))}
                      placeholder="Title (e.g. VENICE)"
                      className={inputCls}
                    />
                    <input
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value.slice(0, 70))}
                      placeholder="Subtitle (optional)"
                      className={inputCls}
                    />
                    <div className="flex gap-2">
                      {(["top", "center", "bottom"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setPlacement(p)}
                          className={`pill flex-1 rounded-lg py-2 text-xs capitalize ${
                            placement === p ? "pill-active" : ""
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs leading-5 text-muted">
                      Text is typeset over the image after generation, so it&apos;s
                      always crisp and correctly spelled.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Images per run
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`pill h-9 w-9 rounded-lg text-sm ${
                        count === n ? "pill-active" : ""
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-muted hover:text-foreground"
                >
                  {showAdvanced ? "▾" : "▸"} Advanced settings
                </button>
                {showAdvanced && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted">
                        Seed
                      </label>
                      <input
                        value={seed}
                        onChange={(e) =>
                          setSeed(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="random"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">
                        Steps (1–4)
                      </label>
                      <input
                        value={steps}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "");
                          setSteps(v && parseInt(v, 10) > 4 ? "4" : v);
                        }}
                        placeholder="auto"
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Your image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`card flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-sm text-muted transition-colors ${
                    dragOver ? "border-accent" : "border-line"
                  }`}
                >
                  {uploadedImage ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={uploadedImage}
                        alt="uploaded"
                        className="max-h-56 rounded-xl"
                      />
                      <span className="mt-3 text-xs">
                        Click or drop to replace · format {uploadRatio}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="mb-2 text-3xl">🖼</span>
                      Click or drag & drop a photo
                      <span className="mt-1 text-xs opacity-70">
                        JPEG, PNG or WebP
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  What should change?
                </label>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                      generate();
                  }}
                  rows={3}
                  placeholder="Make it a watercolor painting… / Turn the sky into sunset… / Add falling snow…"
                  className={`${inputCls} resize-none`}
                />
              </div>

              <p className="rounded-xl border border-line bg-surface px-4 py-3 text-xs leading-5 text-muted">
                ℹ️ Reimagine studies your photo with a vision AI, then recreates
                it with your change applied. The result is a fresh
                interpretation — close to your original, not a pixel-exact
                edit.
              </p>
            </>
          )}

          <button
            onClick={generate}
            disabled={busy || !canGenerate}
            className="btn-accent w-full rounded-xl py-3.5 font-semibold"
          >
            {busy
              ? mode === "edit"
                ? "Reimagining…"
                : "Generating…"
              : mode === "edit"
                ? "✳ Reimagine"
                : `✳ Generate${count > 1 ? " " + count + " images" : ""}`}
          </button>

          {errors.map((e, i) => (
            <p
              key={i}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              {e}
            </p>
          ))}
        </div>

        {/* ---------- results ---------- */}
        <div>
          {results.length === 0 && pendingCount === 0 && (
            <div className="flex h-full min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-line text-muted lg:min-h-80">
              <span className="mb-3 text-4xl">✳</span>
              <p className="text-sm">Your creations will appear here</p>
            </div>
          )}
          <div
            className={`grid gap-4 ${
              mode === "create" && count > 1 ? "sm:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {results.map((img) => (
              <figure key={img.id}>
                <div className="group relative overflow-hidden rounded-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.prompt}
                    className="w-full"
                    style={{ aspectRatio: ratioToCss(img.aspectRatio) }}
                  />
                  <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <span className="truncate text-xs text-white/90">
                      seed {img.seed}
                    </span>
                    <span className="flex gap-1.5">
                      <a
                        href={img.url}
                        download={`dattas-lens-${img.id}.jpg`}
                        className="rounded-lg bg-white/90 px-2.5 py-1 text-xs text-foreground hover:bg-white"
                        title="Download"
                      >
                        ⬇
                      </a>
                      <button
                        onClick={() => remix(img)}
                        className="rounded-lg bg-white/90 px-2.5 py-1 text-xs text-foreground hover:bg-white"
                        title="Remix — reuse prompt, style and seed"
                      >
                        ♻
                      </button>
                      <button
                        onClick={() => removeImage(img.id)}
                        className="rounded-lg bg-white/90 px-2.5 py-1 text-xs text-red-600 hover:bg-white"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </span>
                  </figcaption>
                </div>
                {img.finalPrompt && (
                  <details className="mt-2 text-xs text-muted">
                    <summary className="cursor-pointer">
                      🪄 AI-crafted prompt
                    </summary>
                    <p className="mt-1 leading-5">{img.finalPrompt}</p>
                  </details>
                )}
              </figure>
            ))}
            {Array.from({ length: pendingCount }, (_, i) => (
              <div
                key={`pending-${i}`}
                className="shimmer w-full rounded-2xl"
                style={{ aspectRatio: ratioToCss(resultRatio) }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ---------- history ---------- */}
      {history.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display mb-4 text-lg font-bold">
            Recent creations
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {history.slice(0, 12).map((img) => (
              <button
                key={img.id}
                onClick={() => remix(img)}
                title={`${img.prompt} (click to remix)`}
                className="group relative overflow-hidden rounded-xl"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.prompt}
                  loading="lazy"
                  className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default function StudioPage() {
  return (
    <Suspense>
      <StudioInner />
    </Suspense>
  );
}
