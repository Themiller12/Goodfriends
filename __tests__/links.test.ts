import {firstUrl, splitLinks} from '../src/utils/links';
import {getLinkPreview} from '../src/services/LinkPreviewService';

describe('splitLinks', () => {
  it('detects links and keeps trailing punctuation out of them', () => {
    expect(splitLinks('Regarde https://exemple.fr/page?a=1, super !')).toEqual([
      {text: 'Regarde '},
      {text: 'https://exemple.fr/page?a=1', url: 'https://exemple.fr/page?a=1'},
      {text: ', super !'},
    ]);
  });

  it('adds https to www links', () => {
    expect(firstUrl('va sur www.exemple.fr.')).toBe('https://www.exemple.fr');
  });

  it('returns no link for plain text', () => {
    expect(firstUrl('bonjour')).toBeNull();
  });
});

describe('getLinkPreview', () => {
  const html = `<html><head><title>Titre &amp; co</title>
    <meta property="og:title" content="Mon titre">
    <meta content="Une description" property="og:description">
    <meta property="og:image" content="/img/a.png"></head></html>`;

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('reads Open Graph tags and resolves relative images', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: true,
      url: 'https://exemple.fr/article',
      headers: {get: () => 'text/html; charset=utf-8'},
      text: async () => html,
    }));

    expect(await getLinkPreview('https://exemple.fr/article')).toEqual({
      url: 'https://exemple.fr/article',
      title: 'Mon titre',
      description: 'Une description',
      image: 'https://exemple.fr/img/a.png',
      siteName: 'exemple.fr',
    });
  });

  it('never fetches private addresses', async () => {
    const fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;

    expect(await getLinkPreview('http://192.168.1.10/admin')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
