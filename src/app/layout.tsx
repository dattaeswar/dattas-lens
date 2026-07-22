import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Datta's Lens — AI Image Studio",
  description:
    "Generate and reimagine images, posters and art in seconds. Powered by FLUX.2 on NVIDIA GPUs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-50 border-b border-line bg-background/90 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-base text-white">
                ✳
              </span>
              <span className="font-display truncate text-xl font-bold tracking-tight">
                Datta&apos;s Lens
              </span>
              <span className="hidden text-sm text-muted md:inline">
                · your creative studio
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-3 text-sm sm:gap-5">
              <Link
                href="/create"
                className="text-muted transition-colors hover:text-foreground"
              >
                Studio
              </Link>
              <Link
                href="/gallery"
                className="text-muted transition-colors hover:text-foreground"
              >
                Gallery
              </Link>
              <Link
                href="/create"
                className="btn-accent hidden rounded-full px-4 py-1.5 font-medium sm:inline-block"
              >
                Start creating
              </Link>
            </div>
          </nav>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="border-t border-line py-5 text-center text-xs text-muted">
          Datta&apos;s Lens can make mistakes. Verify important information. ·
          Powered by FLUX.2 on NVIDIA GPUs
        </footer>
      </body>
    </html>
  );
}
