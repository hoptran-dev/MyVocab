/**
 * Resolves API endpoints cleanly for both:
 * 1) Full-stack mode (AI Studio / Node.js Express server on same origin)
 * 2) Static GitHub Pages mode (optionally pointed to an external backend via VITE_API_BASE_URL)
 */

export function normalizeBasePath(rawBase?: string): string {
  if (!rawBase || rawBase === '/') return '/';
  const cleaned = rawBase.replace(/\/+/g, '/');
  if (cleaned === './' || cleaned === '.') return './';
  const withLeading = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export function normalizeApiBase(rawApiBase?: string): string {
  if (!rawApiBase) return '';
  return rawApiBase.trim().replace(/\/+$/, '');
}

const CONFIGURED_API_BASE = normalizeApiBase(
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_API_BASE_URL as string | undefined)
    : ''
);

export function apiUrl(path: string, overrideBase?: string): string {
  const base = overrideBase !== undefined ? normalizeApiBase(overrideBase) : CONFIGURED_API_BASE;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export function staticAssetUrl(relativePath: string): string {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : '/';
  const cleanRel = relativePath.replace(/^\/+/, '');
  return `${base.endsWith('/') ? base : `${base}/`}${cleanRel}`;
}

export const STATIC_HOST_AI_NOTICE =
  'GitHub Pages chỉ chạy web tĩnh nên không thể chạy máy chủ AI (Node.js). Để bật đầy đủ tính năng AI, hãy triển khai repo GitHub này lên Render (đã có sẵn file render.yaml) và gắn biến VITE_API_BASE_URL trong GitHub Actions — hoặc truy cập trực tiếp link Render. Trên bản tĩnh hiện tại, bạn vẫn dùng bình thường Nhớ sâu 6 cấp, tất cả trò chơi, thêm từ thủ công/hàng loạt và Từ điển Offline.';

export async function parseApiJson<T>(res: Response, fallbackError: string): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (res.status === 404 || res.status === 405) {
      throw new Error(STATIC_HOST_AI_NOTICE);
    }
    throw new Error(fallbackError);
  }
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data?.error || fallbackError);
  }
  return data;
}
