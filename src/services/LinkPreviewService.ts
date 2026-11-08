export interface LinkPreviewData {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName: string;
}

const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_CHARS = 300000;

const cache = new Map<string, LinkPreviewData | null>();
const inFlight = new Map<string, Promise<LinkPreviewData | null>>();

const PRIVATE_HOST = /^(localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/i;

const ENTITIES: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};

const decodeEntities = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, ' ')
    .trim();

function metaContent(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byKeyFirst = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*?content\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
      'i',
    );
    const byContentFirst = new RegExp(
      `<meta[^>]+content\\s*=\\s*(?:"([^"]*)"|'([^']*)')[^>]*?(?:property|name)\\s*=\\s*["']${escaped}["']`,
      'i',
    );
    const found = html.match(byKeyFirst) ?? html.match(byContentFirst);
    const value = found?.[1] ?? found?.[2];
    if (value && decodeEntities(value)) return decodeEntities(value);
  }
  return undefined;
}

const hostOf = (url: string): string | null => url.match(/^https?:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i)?.[1] ?? null;

// URL.hostname n'est pas disponible dans React Native : résolution manuelle des adresses relatives
function resolveUrl(base: string, relative: string): string | undefined {
  if (/^https?:\/\//i.test(relative)) return relative;
  const origin = base.match(/^(https?:\/\/[^/?#]+)/i)?.[1];
  if (!origin) return undefined;
  if (relative.startsWith('//')) return `${origin.split(':')[0]}:${relative}`;
  if (relative.startsWith('/')) return origin + relative;
  const dir = base.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/');
  return (dir.startsWith(origin) ? dir : `${origin}/`) + relative;
}

function parsePreview(url: string, html: string): LinkPreviewData | null {
  const head = html.slice(0, MAX_HTML_CHARS);
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = metaContent(head, ['og:title', 'twitter:title']) ?? (titleTag ? decodeEntities(titleTag) : undefined);
  if (!title) return null;

  const description = metaContent(head, ['og:description', 'twitter:description', 'description']);
  const rawImage = metaContent(head, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']);
  const image = rawImage ? resolveUrl(url, rawImage) : undefined;
  const host = hostOf(url)?.replace(/^www\./, '') ?? url;

  return {
    url,
    title: title.slice(0, 160),
    description: description?.slice(0, 240),
    image,
    siteName: metaContent(head, ['og:site_name']) ?? host,
  };
}

async function download(url: string): Promise<LinkPreviewData | null> {
  const host = hostOf(url);
  if (!host || PRIVATE_HOST.test(host)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; GoodfriendsLinkPreview/1.0; +facebookexternalhit/1.1)',
      },
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/html/i.test(type)) return null;
    return parsePreview(response.url || url, await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Aperçu d'un lien (titre, description, image) lu depuis l'appareil, mis en cache pour la session
export function getLinkPreview(url: string): Promise<LinkPreviewData | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  const pending = inFlight.get(url);
  if (pending) return pending;

  const request = download(url)
    .then(preview => {
      cache.set(url, preview);
      return preview;
    })
    .finally(() => inFlight.delete(url));
  inFlight.set(url, request);
  return request;
}

export function getCachedLinkPreview(url: string): LinkPreviewData | null | undefined {
  return cache.get(url);
}
