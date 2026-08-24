export interface Country {
  code: string;
  nameJa: string;
  flag: string;
  /** NewsData.io の language パラメータに渡すISO 639-1コード（例: "ja"）。記事の言語を絞り込むために使う */
  langHint?: string;
}

// 対応国マスタ。国を増やす場合はここに1行追加するだけでよい。
export const COUNTRIES: Country[] = [
  { code: "jp", nameJa: "日本", flag: "🇯🇵", langHint: "ja" },
  { code: "us", nameJa: "アメリカ", flag: "🇺🇸", langHint: "en" },
  { code: "gb", nameJa: "イギリス", flag: "🇬🇧", langHint: "en" },
  { code: "de", nameJa: "ドイツ", flag: "🇩🇪", langHint: "de" },
  { code: "in", nameJa: "インド", flag: "🇮🇳", langHint: "en" },
  { code: "br", nameJa: "ブラジル", flag: "🇧🇷", langHint: "pt" },
  { code: "ke", nameJa: "ケニア", flag: "🇰🇪", langHint: "en" },
  { code: "kr", nameJa: "韓国", flag: "🇰🇷", langHint: "ko" },
];

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
