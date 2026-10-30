"use client";

import { ApiError } from "./api/client";

const MAX_SIDE = 1600;

/** Resizes a chosen artist photo in the browser (max 1600 px, JPEG) so uploads stay small and fast. */
export async function prepareArtistPhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new ApiError("VALIDATION", "Choose a JPEG, PNG or WebP photo");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new ApiError("VALIDATION", "That photo couldn't be opened");
  });
  if (bitmap.width < 400 || bitmap.height < 400) throw new ApiError("VALIDATION", `This photo is ${bitmap.width} × ${bitmap.height}. Use one at least 400 × 400 pixels.`);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new ApiError("VALIDATION", "Couldn't process that photo"))), "image/jpeg", 0.85));
  return { blob, width, height };
}
