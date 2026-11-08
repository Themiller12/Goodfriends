export interface TextPart {
  text: string;
  url?: string; // URL complète (https://…) quand la partie est un lien
}

const URL_REGEX = /https?:\/\/[^\s<>]+|www\.[^\s<>]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"»…]+$/;

export const toFullUrl = (raw: string): string => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

// Découpe un texte en morceaux simples et liens ; la ponctuation finale ne fait pas partie du lien
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const regex = new RegExp(URL_REGEX.source, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const link = match[0].replace(TRAILING_PUNCTUATION, '');
    if (!link) continue;
    if (match.index > lastIndex) parts.push({text: text.slice(lastIndex, match.index)});
    parts.push({text: link, url: toFullUrl(link)});
    lastIndex = match.index + link.length;
    regex.lastIndex = lastIndex;
  }
  if (lastIndex < text.length) parts.push({text: text.slice(lastIndex)});
  return parts;
}

export function firstUrl(text?: string | null): string | null {
  if (!text) return null;
  return splitLinks(text).find(p => p.url)?.url ?? null;
}
