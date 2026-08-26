export type Region =
  | "東アジア"
  | "東南アジア"
  | "南アジア"
  | "北米"
  | "南米"
  | "ヨーロッパ"
  | "中東"
  | "アフリカ"
  | "オセアニア";

export interface Country {
  code: string;
  nameJa: string;
  flag: string;
  region: Region;
  /** NewsData.io の language パラメータに渡すISO 639-1コード（例: "ja"）。記事の言語を絞り込むために使う */
  langHint?: string;
}

// 対応国マスタ。国を増やす場合はここに1行追加するだけでよい。地域(region)は選択UIのグルーピングに使う。
export const COUNTRIES: Country[] = [
  // 東アジア
  { code: "jp", nameJa: "日本", flag: "🇯🇵", region: "東アジア", langHint: "ja" },
  { code: "kr", nameJa: "韓国", flag: "🇰🇷", region: "東アジア", langHint: "ko" },
  { code: "cn", nameJa: "中国", flag: "🇨🇳", region: "東アジア", langHint: "zh" },
  { code: "tw", nameJa: "台湾", flag: "🇹🇼", region: "東アジア", langHint: "zh" },
  { code: "hk", nameJa: "香港", flag: "🇭🇰", region: "東アジア", langHint: "zh" },

  // 東南アジア
  { code: "sg", nameJa: "シンガポール", flag: "🇸🇬", region: "東南アジア", langHint: "en" },
  { code: "th", nameJa: "タイ", flag: "🇹🇭", region: "東南アジア", langHint: "th" },
  { code: "vn", nameJa: "ベトナム", flag: "🇻🇳", region: "東南アジア", langHint: "vi" },
  { code: "id", nameJa: "インドネシア", flag: "🇮🇩", region: "東南アジア", langHint: "id" },
  { code: "ph", nameJa: "フィリピン", flag: "🇵🇭", region: "東南アジア", langHint: "en" },

  // 南アジア
  { code: "in", nameJa: "インド", flag: "🇮🇳", region: "南アジア", langHint: "en" },
  { code: "pk", nameJa: "パキスタン", flag: "🇵🇰", region: "南アジア", langHint: "en" },
  { code: "bd", nameJa: "バングラデシュ", flag: "🇧🇩", region: "南アジア", langHint: "bn" },

  // 北米
  { code: "us", nameJa: "アメリカ", flag: "🇺🇸", region: "北米", langHint: "en" },
  { code: "ca", nameJa: "カナダ", flag: "🇨🇦", region: "北米", langHint: "en" },
  { code: "mx", nameJa: "メキシコ", flag: "🇲🇽", region: "北米", langHint: "es" },
  { code: "cu", nameJa: "キューバ", flag: "🇨🇺", region: "北米", langHint: "es" },

  // 南米
  { code: "br", nameJa: "ブラジル", flag: "🇧🇷", region: "南米", langHint: "pt" },
  { code: "ar", nameJa: "アルゼンチン", flag: "🇦🇷", region: "南米", langHint: "es" },
  { code: "cl", nameJa: "チリ", flag: "🇨🇱", region: "南米", langHint: "es" },
  { code: "pe", nameJa: "ペルー", flag: "🇵🇪", region: "南米", langHint: "es" },
  { code: "co", nameJa: "コロンビア", flag: "🇨🇴", region: "南米", langHint: "es" },
  { code: "ve", nameJa: "ベネズエラ", flag: "🇻🇪", region: "南米", langHint: "es" },

  // ヨーロッパ
  { code: "gb", nameJa: "イギリス", flag: "🇬🇧", region: "ヨーロッパ", langHint: "en" },
  { code: "de", nameJa: "ドイツ", flag: "🇩🇪", region: "ヨーロッパ", langHint: "de" },
  { code: "fr", nameJa: "フランス", flag: "🇫🇷", region: "ヨーロッパ", langHint: "fr" },
  { code: "it", nameJa: "イタリア", flag: "🇮🇹", region: "ヨーロッパ", langHint: "it" },
  { code: "es", nameJa: "スペイン", flag: "🇪🇸", region: "ヨーロッパ", langHint: "es" },
  { code: "ru", nameJa: "ロシア", flag: "🇷🇺", region: "ヨーロッパ", langHint: "ru" },
  { code: "ua", nameJa: "ウクライナ", flag: "🇺🇦", region: "ヨーロッパ", langHint: "uk" },
  { code: "se", nameJa: "スウェーデン", flag: "🇸🇪", region: "ヨーロッパ", langHint: "sv" },
  { code: "pl", nameJa: "ポーランド", flag: "🇵🇱", region: "ヨーロッパ", langHint: "pl" },
  { code: "gr", nameJa: "ギリシャ", flag: "🇬🇷", region: "ヨーロッパ", langHint: "el" },
  { code: "pt", nameJa: "ポルトガル", flag: "🇵🇹", region: "ヨーロッパ", langHint: "pt" },
  { code: "nl", nameJa: "オランダ", flag: "🇳🇱", region: "ヨーロッパ", langHint: "nl" },
  { code: "ch", nameJa: "スイス", flag: "🇨🇭", region: "ヨーロッパ", langHint: "de" },
  { code: "at", nameJa: "オーストリア", flag: "🇦🇹", region: "ヨーロッパ", langHint: "de" },
  { code: "no", nameJa: "ノルウェー", flag: "🇳🇴", region: "ヨーロッパ", langHint: "no" },
  { code: "fi", nameJa: "フィンランド", flag: "🇫🇮", region: "ヨーロッパ", langHint: "fi" },
  { code: "ie", nameJa: "アイルランド", flag: "🇮🇪", region: "ヨーロッパ", langHint: "en" },

  // 中東
  { code: "ae", nameJa: "アラブ首長国連邦", flag: "🇦🇪", region: "中東", langHint: "en" },
  { code: "sa", nameJa: "サウジアラビア", flag: "🇸🇦", region: "中東", langHint: "ar" },
  { code: "il", nameJa: "イスラエル", flag: "🇮🇱", region: "中東", langHint: "en" },
  { code: "tr", nameJa: "トルコ", flag: "🇹🇷", region: "中東", langHint: "tr" },

  // アフリカ
  { code: "ke", nameJa: "ケニア", flag: "🇰🇪", region: "アフリカ", langHint: "en" },
  { code: "ng", nameJa: "ナイジェリア", flag: "🇳🇬", region: "アフリカ", langHint: "en" },
  { code: "za", nameJa: "南アフリカ", flag: "🇿🇦", region: "アフリカ", langHint: "en" },
  { code: "eg", nameJa: "エジプト", flag: "🇪🇬", region: "アフリカ", langHint: "ar" },
  { code: "gh", nameJa: "ガーナ", flag: "🇬🇭", region: "アフリカ", langHint: "en" },

  // オセアニア
  { code: "au", nameJa: "オーストラリア", flag: "🇦🇺", region: "オセアニア", langHint: "en" },
  { code: "nz", nameJa: "ニュージーランド", flag: "🇳🇿", region: "オセアニア", langHint: "en" },
];

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export const REGIONS: Region[] = [
  "東アジア",
  "東南アジア",
  "南アジア",
  "北米",
  "南米",
  "ヨーロッパ",
  "中東",
  "アフリカ",
  "オセアニア",
];

export function countriesByRegion(region: Region): Country[] {
  return COUNTRIES.filter((c) => c.region === region);
}
