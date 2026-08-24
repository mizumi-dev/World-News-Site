import type { KeyValueBackend } from "./backend";

interface UpstashResponse {
  result: string | null;
  error?: string;
}

/**
 * Upstash Redis のREST APIを使った永続キャッシュ（Vercel等サーバーレス環境向け）。
 * Vercel Marketplace の「Upstash for Redis」連携、または https://upstash.com で無料作成したデータベースの
 * REST URL/トークンを UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN に設定すると自動的に使われる。
 */
export function createUpstashBackend(url: string, token: string): KeyValueBackend {
  async function command(args: string[]): Promise<string | null> {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as UpstashResponse;
    if (!res.ok || data.error) {
      throw new Error(data.error ?? `Upstash Redis がエラーを返しました (status ${res.status})`);
    }
    return data.result;
  }

  return {
    get(key) {
      return command(["GET", key]);
    },
    async set(key, value) {
      await command(["SET", key, value]);
    },
  };
}
