import Link from "next/link";

const SAMPLE_PROMPTS = [
  "Design a poster for a Venice travel festival",
  "Product shot of a ceramic coffee mug, studio light",
  "Watercolor map of an imaginary island kingdom",
  "Cute robot barista, 3D render",
];

const FEATURES = [
  {
    emoji: "⚡",
    title: "Seconds, not minutes",
    body: "Finished images in roughly three seconds — no waiting around for a render.",
  },
  {
    emoji: "✍️",
    title: "Perfectly spelled titles",
    body: "AI image models garble text — ours doesn't. Titles are typeset separately and composited on top, always crisp and correctly spelled.",
  },
  {
    emoji: "🪄",
    title: "AI-enhanced prompts",
    body: "A language model rewrites your idea with richer, more specific art direction before it hits the image model.",
  },
  {
    emoji: "🎨",
    title: "12 style presets",
    body: "Photoreal, cinematic, anime, poster, logo and more — one click, zero prompt engineering.",
  },
  {
    emoji: "📐",
    title: "Every format",
    body: "Square avatars, 2:3 posters, 21:9 banners, 9:21 stories — pixel-perfect for each platform.",
  },
  {
    emoji: "🎲",
    title: "Seed control + remix",
    body: "Lock a composition you love and iterate on it, or remix anything from your gallery.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      {/* hero */}
      <section className="mx-auto max-w-3xl px-6 pt-20 pb-14 text-center sm:pt-28">
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Hi, I&apos;m Datta&apos;s Lens{" "}
          <span className="inline-block animate-pulse">✳</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-muted">
          Ask me for a poster, product shot or concept scene — I generate it
          in seconds, with titles that are always spelled right.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/create"
            className="btn-accent w-full rounded-full px-7 py-3 text-center font-semibold sm:w-auto"
          >
            Open the Studio →
          </Link>
          <Link
            href="/gallery"
            className="pill w-full rounded-full px-7 py-3 text-center font-semibold sm:w-auto"
          >
            Browse Gallery
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-2.5">
          {SAMPLE_PROMPTS.map((p) => (
            <Link
              key={p}
              href={`/create?prompt=${encodeURIComponent(p)}`}
              className="pill rounded-full px-4 py-2 text-xs sm:text-sm"
            >
              {p}
            </Link>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="card rounded-2xl p-6 transition-transform hover:-translate-y-1"
            >
              <div className="mb-3 text-2xl">{f.emoji}</div>
              <h3 className="font-display mb-2 text-lg font-bold">{f.title}</h3>
              <p className="text-sm leading-6 text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
