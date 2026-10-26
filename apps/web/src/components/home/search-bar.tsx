import { ArrowRight } from "lucide-react";
import { BUDGET_BANDS, CITIES } from "@/lib/catalogue/data";

const fieldClass =
  "w-full bg-transparent font-display text-sm text-ink outline-none placeholder:text-muted";

/** Plain GET form into /talent — works without JavaScript. */
export function SearchBar() {
  return (
    <div id="search" className="shell relative z-10 -mt-14 scroll-mt-28">
      <form
        action="/talent"
        className="grid gap-1 rounded-[13px] border border-ink/10 bg-white p-2.5 shadow-card md:grid-cols-[1.6fr_1fr_1fr_0.9fr_auto]"
      >
        <label className="rounded-xl px-4 py-2.5 transition-colors hover:bg-cream-soft">
          <span className="eyebrow block text-[0.65rem] text-muted">Talent</span>
          <input name="q" placeholder="Singer, DJ, comedian…" className={fieldClass} />
        </label>
        <label className="rounded-xl px-4 py-2.5 transition-colors hover:bg-cream-soft md:border-l md:border-line">
          <span className="eyebrow block text-[0.65rem] text-muted">City</span>
          <select name="city" defaultValue="" className={fieldClass}>
            <option value="">Any city</option>
            {CITIES.map((city) => (
              <option key={city.slug} value={city.slug}>
                {city.name}
              </option>
            ))}
          </select>
        </label>
        <label className="rounded-xl px-4 py-2.5 transition-colors hover:bg-cream-soft md:border-l md:border-line">
          <span className="eyebrow block text-[0.65rem] text-muted">Event date</span>
          <input type="date" name="date" className={fieldClass} />
        </label>
        <label className="rounded-xl px-4 py-2.5 transition-colors hover:bg-cream-soft md:border-l md:border-line">
          <span className="eyebrow block text-[0.65rem] text-muted">Budget</span>
          <select name="budget" defaultValue="" className={fieldClass}>
            <option value="">Any budget</option>
            {BUDGET_BANDS.map((band) => (
              <option key={band.id} value={band.id}>
                {band.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-gold px-7">
          Search
          <ArrowRight aria-hidden />
        </button>
      </form>
    </div>
  );
}
