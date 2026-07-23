import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { put, del, list } from "@vercel/blob";

/**
 * Image store with two backends, chosen automatically:
 * - Local filesystem (./data) when no BLOB_READ_WRITE_TOKEN is set — used in
 *   local dev, where the disk is real and persistent, and every request is
 *   handled by the same single process.
 * - Vercel Blob when BLOB_READ_WRITE_TOKEN is present — used in production on
 *   Vercel, whose function filesystem is read-only/ephemeral AND whose
 *   requests are handled by many concurrent, independent instances. Each
 *   image's metadata lives in its own blob (`meta/{id}.json`) rather than a
 *   single shared index file — a shared index requires read-modify-write,
 *   and concurrent instances have no way to coordinate that lock, so two
 *   generations landing on different instances at the same time would
 *   silently clobber each other's index entry (image uploaded, entry lost,
 *   permanent 404). Per-id files can't collide since every id is unique.
 */

const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const DATA_DIR = path.join(process.cwd(), "data");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

function blobImagePath(id: string): string {
  return `images/${id}.jpg`;
}
function blobMetaPath(id: string): string {
  return `meta/${id}.json`;
}

export interface ImageRecord {
  id: string;
  prompt: string;
  style: string;
  aspectRatio: string;
  seed: number;
  createdAt: string;
  /** the actual prompt sent to the model, when it differs (enhance/edit) */
  finalPrompt?: string;
  /** "create" (default) or "edit" for upload-and-modify results */
  source?: string;
  /** composited poster title text, when present */
  title?: string;
  subtitle?: string;
  /** Blob backend only: public URL of the JPEG */
  blobUrl?: string;
}

let writeLock: Promise<unknown> = Promise.resolve();

/** Serialize index writes so concurrent generations don't clobber each other. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => {});
  return run;
}

// ---------------------------------------------------------------- filesystem

async function fsReadIndex(): Promise<ImageRecord[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf8");
    return JSON.parse(raw) as ImageRecord[];
  } catch {
    return [];
  }
}

async function fsSaveImage(
  base64: string,
  meta: Omit<ImageRecord, "id" | "createdAt">,
): Promise<ImageRecord> {
  return withLock(async () => {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
    const record: ImageRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...meta,
    };
    await fs.writeFile(
      path.join(IMAGES_DIR, `${record.id}.jpg`),
      Buffer.from(base64, "base64"),
    );
    const index = await fsReadIndex();
    index.unshift(record);
    await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
    return record;
  });
}

async function fsGetImagePath(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const file = path.join(IMAGES_DIR, `${id}.jpg`);
  try {
    await fs.access(file);
    return file;
  } catch {
    return null;
  }
}

async function fsDeleteImage(id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return withLock(async () => {
    const index = await fsReadIndex();
    const next = index.filter((r) => r.id !== id);
    if (next.length === index.length) return false;
    await fs.writeFile(INDEX_FILE, JSON.stringify(next, null, 2));
    await fs.rm(path.join(IMAGES_DIR, `${id}.jpg`), { force: true });
    return true;
  });
}

// --------------------------------------------------------------- vercel blob

async function blobSaveImage(
  base64: string,
  meta: Omit<ImageRecord, "id" | "createdAt" | "blobUrl">,
): Promise<ImageRecord> {
  const id = crypto.randomUUID();
  const { url } = await put(blobImagePath(id), Buffer.from(base64, "base64"), {
    access: "public",
    addRandomSuffix: false,
    contentType: "image/jpeg",
  });
  const record: ImageRecord = {
    id,
    createdAt: new Date().toISOString(),
    blobUrl: url,
    ...meta,
  };
  // Written after the image so a reader never sees metadata for a
  // not-yet-uploaded image, but nothing else reads or rewrites this file —
  // each id gets its own, so there's nothing for a concurrent request to race.
  await put(blobMetaPath(id), JSON.stringify(record), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  return record;
}

async function blobListImages(limit: number): Promise<ImageRecord[]> {
  const { blobs } = await list({ prefix: "meta/" });
  const sorted = blobs
    .slice()
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, limit);
  const records = await Promise.all(
    sorted.map(async (b) => {
      const res = await fetch(b.url, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as ImageRecord;
    }),
  );
  return records.filter((r): r is ImageRecord => r !== null);
}

async function blobGetImageRecord(id: string): Promise<ImageRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const metaPathStr = blobMetaPath(id);
  const { blobs } = await list({ prefix: metaPathStr, limit: 1 });
  const match = blobs.find((b) => b.pathname === metaPathStr);
  if (!match) return null;
  const res = await fetch(match.url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as ImageRecord;
}

async function blobDeleteImage(id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const record = await blobGetImageRecord(id);
  if (!record) return false;
  const metaPathStr = blobMetaPath(id);
  const { blobs } = await list({ prefix: metaPathStr, limit: 1 });
  const metaUrl = blobs.find((b) => b.pathname === metaPathStr)?.url;
  const urls = [record.blobUrl, metaUrl].filter((u): u is string => Boolean(u));
  await del(urls);
  return true;
}

// ---------------------------------------------------------------- public API

export async function saveImage(
  base64: string,
  meta: Omit<ImageRecord, "id" | "createdAt" | "blobUrl">,
): Promise<ImageRecord> {
  return USE_BLOB ? blobSaveImage(base64, meta) : fsSaveImage(base64, meta);
}

export async function listImages(limit = 100): Promise<ImageRecord[]> {
  if (USE_BLOB) return blobListImages(limit);
  const index = await fsReadIndex();
  return index.slice(0, limit);
}

/** Filesystem backend only — resolves a local path to stream. */
export async function getImagePath(id: string): Promise<string | null> {
  return USE_BLOB ? null : fsGetImagePath(id);
}

/** Blob backend only — the record carries its public CDN URL. */
export async function getImageRecord(id: string): Promise<ImageRecord | null> {
  if (!USE_BLOB) return null;
  return blobGetImageRecord(id);
}

export async function deleteImage(id: string): Promise<boolean> {
  return USE_BLOB ? blobDeleteImage(id) : fsDeleteImage(id);
}
