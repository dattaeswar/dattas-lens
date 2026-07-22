import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { getImagePath, getImageRecord, deleteImage } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Vercel Blob backend: images are served straight from the CDN.
  const record = await getImageRecord(id);
  if (record?.blobUrl) {
    return NextResponse.redirect(record.blobUrl);
  }

  // Filesystem backend (local dev).
  const file = await getImagePath(id);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const buf = await fs.readFile(file);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteImage(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
