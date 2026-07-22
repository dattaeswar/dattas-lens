import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * File-based image store: JPEGs in ./data/images, metadata in ./data/index.json.
 * Simple and dependency-free; swap for S3/Vercel Blob + a database when
 * deploying to serverless hosts with ephemeral filesystems.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

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
}

let writeLock: Promise<unknown> = Promise.resolve();

async function ensureDirs() {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
}

async function readIndex(): Promise<ImageRecord[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf8");
    return JSON.parse(raw) as ImageRecord[];
  } catch {
    return [];
  }
}

/** Serialize index writes so concurrent generations don't clobber each other. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => {});
  return run;
}

export async function saveImage(
  base64: string,
  meta: Omit<ImageRecord, "id" | "createdAt">,
): Promise<ImageRecord> {
  return withLock(async () => {
    await ensureDirs();
    const record: ImageRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...meta,
    };
    await fs.writeFile(
      path.join(IMAGES_DIR, `${record.id}.jpg`),
      Buffer.from(base64, "base64"),
    );
    const index = await readIndex();
    index.unshift(record);
    await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
    return record;
  });
}

export async function listImages(limit = 100): Promise<ImageRecord[]> {
  const index = await readIndex();
  return index.slice(0, limit);
}

export async function getImagePath(id: string): Promise<string | null> {
  // ids are UUIDs we minted; reject anything else to prevent path traversal
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const file = path.join(IMAGES_DIR, `${id}.jpg`);
  try {
    await fs.access(file);
    return file;
  } catch {
    return null;
  }
}

export async function deleteImage(id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return withLock(async () => {
    const index = await readIndex();
    const next = index.filter((r) => r.id !== id);
    if (next.length === index.length) return false;
    await fs.writeFile(INDEX_FILE, JSON.stringify(next, null, 2));
    await fs.rm(path.join(IMAGES_DIR, `${id}.jpg`), { force: true });
    return true;
  });
}
