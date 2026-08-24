import { COUNTRIES } from "@/lib/config/countries";

export function CountrySelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {COUNTRIES.map((country) => {
        const isSelected = selected.includes(country.code);
        return (
          <button
            key={country.code}
            onClick={() => toggle(country.code)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              isSelected
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-transparent border-black/15 text-black/70 dark:text-white/70"
            }`}
          >
            {country.flag} {country.nameJa}
          </button>
        );
      })}
    </div>
  );
}
