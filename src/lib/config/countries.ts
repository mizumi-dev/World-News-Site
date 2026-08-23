export interface Country {
  code: string;
  nameJa: string;
  flag: string;
  langHint?: string;
}

// 対応国マスタ。国を増やす場合はここに1行追加するだけでよい。
export const COUNTRIES: Country[] = [
  { code: "jp", nameJa: "日本", flag: "🇯🇵", langHint: "japanese" },
  { code: "us", nameJa: "アメリカ", flag: "🇺🇸", langHint: "english" },
  { code: "gb", nameJa: "イギリス", flag: "🇬🇧", langHint: "english" },
  { code: "de", nameJa: "ドイツ", flag: "🇩🇪", langHint: "german" },
  { code: "in", nameJa: "インド", flag: "🇮🇳", langHint: "english" },
  { code: "br", nameJa: "ブラジル", flag: "🇧🇷", langHint: "portuguese" },
  { code: "ke", nameJa: "ケニア", flag: "🇰🇪", langHint: "english" },
  { code: "kr", nameJa: "韓国", flag: "🇰🇷", langHint: "korean" },
];

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
