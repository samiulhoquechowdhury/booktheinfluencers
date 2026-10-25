import { cacheLife } from "next/cache";

/** Year captured when the page is built; refreshes on the next deploy. */
export async function CopyrightYear() {
  "use cache";
  cacheLife("max");
  return <>{new Date().getFullYear()}</>;
}
