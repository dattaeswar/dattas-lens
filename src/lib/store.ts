import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { put, del, list } from "@vercel/blob";

/**
 * Image store with two backends, chosen automatically:
 * - Local filesystem (./data) when no BLOB_READ_WRITE_TOKEN is set — used in
 *   local dev, where the disk is real and persistent.
 * - Vercel Blob when BLOB_READ_WRITE_TOKEN is present — used in production on
 *   Vercel, whose function filesystem is read-only/ephemeral.
 */

const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const DATA_DIR = path.join(process.cwd(), "data");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const INDEX_FILE = path.join(DATA_DIR, "index.json");
const INDEX_BLOB_PATH = "index.json";

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

async function blobReadIndex(): Promise<ImageRecord[]> {
  const { blobs } = await list({ prefix: INDEX_BLOB_PATH, limit: 1 });
  const match = blobs.find((b) => b.pathname === INDEX_BLOB_PATH);
  if (!match) return [];
  const res = await fetch(match.url, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()) as ImageRecord[];
}

async function blobWriteIndex(index: ImageRecord[]): Promise<void> {
  await put(INDEX_BLOB_PATH, JSON.stringify(index), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
  });
}

async function blobSaveImage(
  base64: string,
  meta: Omit<ImageRecord, "id" | "createdAt" | "blobUrl">,
): Promise<ImageRecord> {
  return withLock(async () => {
    const id = crypto.randomUUID();
    const { url } = await put(`images/${id}.jpg`, Buffer.from(base64, "base64"), {
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
    const index = await blobReadIndex();
    index.unshift(record);
    await blobWriteIndex(index);
    return record;
  });
}

async function blobDeleteImage(id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return withLock(async () => {
    const index = await blobReadIndex();
    const record = index.find((r) => r.id === id);
    if (!record) return false;
    await blobWriteIndex(index.filter((r) => r.id !== id));
    if (record.blobUrl) await del(record.blobUrl);
    return true;
  });
}

// ---------------------------------------------------------------- public API

export async function saveImage(
  base64: string,
  meta: Omit<ImageRecord, "id" | "createdAt" | "blobUrl">,
): Promise<ImageRecord> {
  return USE_BLOB ? blobSaveImage(base64, meta) : fsSaveImage(base64, meta);
}

export async function listImages(limit = 100): Promise<ImageRecord[]> {
  const index = USE_BLOB ? await blobReadIndex() : await fsReadIndex();
  return index.slice(0, limit);
}

/** Filesystem backend only — resolves a local path to stream. */
export async function getImagePath(id: string): Promise<string | null> {
  return USE_BLOB ? null : fsGetImagePath(id);
}

/** Blob backend only — the record carries its public CDN URL. */
export async function getImageRecord(id: string): Promise<ImageRecord | null> {
  if (!USE_BLOB) return null;
  const index = await blobReadIndex();
  return index.find((r) => r.id === id) ?? null;
}

export async function deleteImage(id: string): Promise<boolean> {
  return USE_BLOB ? blobDeleteImage(id) : fsDeleteImage(id);
}
