import { plugin } from 'bun';
import { readFile } from 'node:fs/promises';

// Load the view's real pure exports without mounting its browser UI.
plugin({
  name: 'view-module',
  setup(build) {
    build.onLoad({ filter: /\/src\/views\/.*\.svelte$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      const module = source.match(/<script\s+module\s+lang="ts">([\s\S]*?)<\/script>/);
      if (!module) throw new Error(`Missing module script: ${path}`);
      return { contents: module[1], loader: 'ts' };
    });
  },
});

export const pageModule = (url: URL): Promise<Record<string, any>> => import(url.href);
