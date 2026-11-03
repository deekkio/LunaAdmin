import { call } from './request';
import type { DeleteInput, List } from './types';

export type Kind = 'announcements' | 'notices';

export interface Entry {
  id: string;
  title: string;
  content: string;
  kind: 'announcement' | 'notice' | 'quota';
  users: string[];
  published: boolean;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  read: boolean;
}

export interface EntryInput {
  version: number;
  id: string;
  content: string;
  users: string[];
  published: boolean;
  ttl: number | null;
}

export interface Settings { threshold: number }

export const information = {
  entries: (token: string, kind: Kind, offset: number, limit: number, query = '') =>
    call<List<Entry>>('GET', `/v1/${kind}`, { token, query: { offset, limit, query } }),
  entry: (token: string, kind: Kind, id: string) =>
    call<Entry>('GET', `/v1/${kind}/${id}`, { token }),
  saveEntry: (token: string, kind: Kind, input: EntryInput) =>
    call<Entry>('PUT', `/v1/${kind}`, { token, body: input }),
  deleteEntry: (token: string, kind: Kind, id: string, input: DeleteInput) =>
    call<null>('DELETE', `/v1/${kind}/${id}`, { token, body: input }),
  settings: (token: string) => call<Settings>('GET', '/v1/information', { token }),
  saveSettings: (token: string, threshold: number) =>
    call<Settings>('PUT', '/v1/information', { token, body: { version: 1, threshold } }),
};
