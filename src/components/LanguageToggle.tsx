export type DisplayLanguage = "ja" | "en";

export function LanguageToggle({
  language,
  onChange,
}: {
  language: DisplayLanguage;
  onChange: (language: DisplayLanguage) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-black/15 overflow-hidden text-sm">
      <button
        onClick={() => onChange("ja")}
        className={`px-3 py-1.5 ${
          language === "ja" ? "bg-blue-600 text-white" : "bg-transparent"
        }`}
      >
        日本語
      </button>
      <button
        onClick={() => onChange("en")}
        className={`px-3 py-1.5 ${
          language === "en" ? "bg-blue-600 text-white" : "bg-transparent"
        }`}
      >
        English
      </button>
    </div>
  );
}
