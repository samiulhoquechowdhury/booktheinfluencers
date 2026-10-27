"use client";

/** Hands the browser a file to save (PDF downloads). */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

let fonts: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null;

/** Noto Sans (has ₹) for PDFs built in the browser in demo mode; served from public/fonts. */
export function pdfFonts(base = "") {
  const get = (name: string) =>
    fetch(`${base}/fonts/${name}`).then((r) => {
      if (!r.ok) throw new Error("Couldn't load the PDF font");
      return r.arrayBuffer().then((b) => new Uint8Array(b));
    });
  fonts ??= Promise.all([get("NotoSans-Regular.ttf"), get("NotoSans-Bold.ttf")])
    .then(([regular, bold]) => ({ regular, bold }))
    .catch((error: unknown) => {
      fonts = null; // try again next time
      throw error;
    });
  return fonts;
}
