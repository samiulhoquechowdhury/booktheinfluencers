// Sample photos come from Unsplash and are sized by URL. Uploaded ones (/v1/media/…, or data URLs in demo mode) are
// already resized on upload and are served as they are.

const SIZED_HOST = "https://images.unsplash.com/";

export const isUploaded = (url: string) => !url.startsWith(SIZED_HOST);

export const photoAt = (url: string, width: number, height?: number) => (isUploaded(url) ? url : `${url}&w=${width}${height ? `&h=${height}` : ""}`);
