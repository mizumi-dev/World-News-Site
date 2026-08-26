"use client";

import { useState } from "react";
import { REGIONS, countriesByRegion } from "@/lib/config/countries";

export function CountrySelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  // 初期状態では、選択済みの国を含む地域だけ開いておく
  const [openRegions, setOpenRegions] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const region of REGIONS) {
      if (countriesByRegion(region).some((c) => selected.includes(c.code))) {
        initial.add(region);
      }
    }
    return initial.size > 0 ? initial : new Set([REGIONS[0]]);
  });

  const toggleCountry = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  const toggleRegion = (region: string) => {
    setOpenRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {REGIONS.map((region) => {
        const countries = countriesByRegion(region);
        const selectedCount = countries.filter((c) => selected.includes(c.code)).length;
        const isOpen = openRegions.has(region);

        return (
          <div key={region} className="border border-black/10 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleRegion(region)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-sm font-medium bg-black/[0.02] dark:bg-white/[0.04] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            >
              <span className="flex items-center gap-2">
                <span className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
                {region}
                {selectedCount > 0 && (
                  <span className="text-xs text-accent font-normal">({selectedCount})</span>
                )}
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-wrap gap-2 p-3">
                {countries.map((country) => {
                  const isSelected = selected.includes(country.code);
                  return (
                    <button
                      key={country.code}
                      onClick={() => toggleCountry(country.code)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        isSelected
                          ? "bg-accent text-white border-accent"
                          : "bg-transparent border-black/15 text-black/70 dark:text-white/70"
                      }`}
                    >
                      {country.flag} {country.nameJa}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
