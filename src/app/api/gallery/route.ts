import { NextResponse } from "next/server";
import { listImages } from "@/lib/store";

export async function GET() {
  const images = await listImages(200);
  return NextResponse.json({
    images: images.map((r) => ({ ...r, url: `/api/image/${r.id}` })),
  });
}
