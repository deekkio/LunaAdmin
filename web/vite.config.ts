import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// 网关地址只由 Vite 服务端读取，不注入浏览器包；浏览器始终请求同源 /api/v1/*。
const gateway = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8081'

// LunaUI 组件 dist 内的 @use 相对路径按源码层级（packages/ 为根）编写，
// dist 目录多一层导致解析失败，这里对失败的相对引用兜底解析到 packages 根。
const require = createRequire(import.meta.url)
const packagesRoot = dirname(dirname(require.resolve('@luna/theme-chalk/package.json')))

const sassFallbackImporter = {
  findFileUrl: (url: string) => {
    if (!url.startsWith('../')) return null
    const stripped = url.replace(/^(?:\.\.\/)+/, '')
    if (!stripped) return null
    const base = resolve(packagesRoot, stripped)
    for (const candidate of [`${base}.scss`, `${base}.sass`, `${base}/index.scss`]) {
      if (existsSync(candidate)) return pathToFileURL(candidate)
    }
    return null
  },
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [svelte()],
  css: {
    preprocessorOptions: {
      scss: {
        importers: [sassFallbackImporter],
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'renderer', test: /[\\/]zrender[\\/]/ }],
        },
      },
    },
  },
  server: {
    port: 5181,
    strictPort: true,
    proxy: {
      '/api': {
        target: gateway,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
