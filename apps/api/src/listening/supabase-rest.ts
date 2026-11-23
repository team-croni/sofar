/** Supabase REST(PostgREST)를 service_role로 부르는 작은 도우미 */
export interface RestResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function supabaseRest<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<RestResult<T>> {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key)
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Supabase is not configured',
    };
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }
    return res.ok
      ? { ok: true, status: res.status, data }
      : {
          ok: false,
          status: res.status,
          data: null,
          error: text.slice(0, 300),
        };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e?.message || String(e) };
  }
}

/**
 * 메모리 기반 요청 수 제한 (고정 창).
 * 같은 키로 windowMs 동안 limit번을 넘으면 false.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      if (this.hits.size > 20000) this.hits.clear();
      this.hits.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}
