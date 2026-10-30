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

/** Opens a private file in a new tab. The tab is opened first, while the click still counts, so it isn't blocked. */
export async function openFile(load: () => Promise<Blob>) {
  const tab = window.open("", "_blank");
  try {
    const url = URL.createObjectURL(await load());
    if (tab) tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

let fonts: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null;

/** Noto Sans (has ₹) for PDFs built in the browser in demo mode; served from public/fonts. */
export function pdfFonts(base = "/admin") {
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
