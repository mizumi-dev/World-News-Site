/** キャッシュの実体を保存する場所を抽象化する最小インターフェース */
export interface KeyValueBackend {
  get(key: string): Promise<string | null>;
  /** 複数キーを1往復でまとめて取得する（要約キャッシュの一括読み出しに使う） */
  getMany(keys: string[]): Promise<(string | null)[]>;
  /** ttlSeconds を渡すとその秒数で自動失効する（未対応のバックエンドは無視してよい） */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}
