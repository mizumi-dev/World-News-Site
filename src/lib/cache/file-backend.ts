import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { KeyValueBackend } from "./backend";

const CACHE_DIR = path.join(process.cwd(), ".cache");

/**
 * ローカル開発用のファイルベースキャッシュ。
 * Vercel等のサーバーレス環境ではファイルシステムが永続しないため使用しない
 * （Upstash Redisが設定されていればそちらが自動的に使われる。src/lib/cache/index.ts 参照）。
 *
 * ttlSeconds は無視する。TTLは本番のストレージ肥大化を防ぐためのものであり、
 * 鮮度判定は fetchedAt で別途行っているため、ローカルでは .cache/ を消せば済む。
 */
export function createFileBackend(): KeyValueBackend {
  function keyToPath(key: string): string {
    return path.join(CACHE_DIR, `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  }

  async function get(key: string): Promise<string | null> {
    try {
      return await readFile(keyToPath(key), "utf-8");
    } catch {
      return null;
    }
  }

  return {
    get,
    getMany(keys) {
      return Promise.all(keys.map(get));
    },
    async set(key, value) {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(keyToPath(key), value, "utf-8");
    },
  };
}
