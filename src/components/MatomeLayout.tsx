import type { Country } from "@/lib/config/countries";
import type { CountryNewsMap } from "@/types";

export function MatomeLayout({
  countries,
  newsData,
}: {
  countries: Country[];
  newsData: CountryNewsMap;
}) {
  return (
    <div className="flex flex-col gap-6">
      {countries.map((country) => {
        const entry = newsData[country.code];
        const articles = entry?.articles ?? [];
        return (
          <section key={country.code} className="border border-black/10 rounded-lg overflow-hidden">
            <h2 className="bg-neutral-800 text-white font-bold px-4 py-2 text-sm">
              【速報】{country.flag} {country.nameJa}のニュースまとめ
            </h2>
            <div className="divide-y divide-black/10">
              {articles.length === 0 && (
                <p className="px-4 py-3 text-sm text-black/50 dark:text-white/50">
                  まだニュースがありません。「更新」を押してください。
                </p>
              )}
              {articles.map((article, i) => (
                <div key={article.id} className="px-4 py-3 flex flex-col gap-1">
                  <p className="text-sm">
                    <span className="text-black/40 dark:text-white/40 mr-1">&gt;&gt;{i + 1}</span>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold hover:underline"
                    >
                      {article.titleJa ?? article.originalTitle}
                    </a>
                  </p>
                  {article.summaryJa && (
                    <p className="text-sm text-black/70 dark:text-white/70 bg-black/[0.03] dark:bg-white/[0.05] rounded px-2 py-1.5">
                      {article.summaryJa}
                    </p>
                  )}
                  <p className="text-xs text-black/40 dark:text-white/40">{article.sourceName}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
