import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

// The unmodified Monitor theme site's preview hub is available in development only.
function officialPreview(): Plugin {
  return {
    name: 'monitor-official-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__official-preview.js', (_req, res) => {
        res.setHeader('content-type', 'application/javascript; charset=utf-8')
        res.end(readFileSync(fileURLToPath(new URL('./scripts/official-preview.js', import.meta.url))))
      })
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { src: '/__official-preview.js' }, injectTo: 'head-prepend' }]
    },
  }
}

export default defineConfig({
  plugins: [vue(), ...(process.env.MONITOR_DEMO === '1' ? [officialPreview()] : [])],
  build: {
    chunkSizeWarningLimit: 1600,
    assetsInlineLimit: (file) => file.includes('/country-flag-icons/') ? false : undefined,
  },
  server: {
    proxy: {
      '/api': { target: process.env.MONITOR_HUB || 'http://127.0.0.1:9911', changeOrigin: true, ws: true },
    },
  },
})
