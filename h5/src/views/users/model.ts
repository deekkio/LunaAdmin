import { api } from '../../api';
import type { LinkKind } from '../../api/types';

export type LinkInfo = { id: string; url: string };

export const readLinks = async (
  token: string,
  account: string,
  kind: LinkKind,
  signal: AbortSignal,
): Promise<LinkInfo[]> => {
  const links: LinkInfo[] = [];
  try {
    if (signal.aborted) return [];
    const response = await api.userLinks(token, account, signal);
    if (signal.aborted || response.code || !Array.isArray(response.data)) return [];
    for (const entry of response.data) {
      if (signal.aborted) return [];
      if (entry.kind !== kind) continue;
      if (typeof entry.id !== 'string' || !entry.id) return [];
      const result = await api.accessLink(token, entry.id, signal);
      if (signal.aborted || result.code) return [];
      if (result.data === null) {
        links.push({ id: entry.id, url: '' });
      } else {
        if (!result.data || typeof result.data.url !== 'string' || !result.data.url) return [];
        links.push({ id: entry.id, url: result.data.url });
      }
    }
  } catch {
    return [];
  }
  return signal.aborted ? [] : links;
};
