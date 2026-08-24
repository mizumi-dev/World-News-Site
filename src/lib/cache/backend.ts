/** キャッシュの実体を保存する場所を抽象化する最小インターフェース */
export interface KeyValueBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
