"use client";

import { ApiError } from "./api";

const MAX_WIDTH = 2400;

/** Resizes a chosen photo in the browser (max 2400 px wide, JPEG) so uploads stay small and fast. */
export async function prepareHeroImage(file: File): Promise<{ blob: Blob; width: number; height: number; preview: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new ApiError("VALIDATION", "Choose a JPEG, PNG or WebP image");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new ApiError("VALIDATION", "That image couldn't be opened");
  });
  if (bitmap.width < 800 || bitmap.height < 300) throw new ApiError("VALIDATION", `This photo is ${bitmap.width} × ${bitmap.height}. Use one at least 800 × 300 pixels.`);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new ApiError("VALIDATION", "Couldn't process that image"))), "image/jpeg", 0.85));
  return { blob, width, height, preview: URL.createObjectURL(blob) };
}
