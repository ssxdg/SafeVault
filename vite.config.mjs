import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-quill-new') || id.includes('quill')) return 'vendor-editor'
          if (id.includes('@ant-design/icons')) return 'vendor-antd-icons'
          if (id.includes('@ant-design/cssinjs')) return 'vendor-antd-cssinjs'
          if (id.includes('rc-table') || id.includes('rc-pagination') || id.includes('rc-virtual-list')) return 'vendor-antd-table'
          if (id.includes('rc-')) return 'vendor-antd-rc'
          if (id.includes('antd') || id.includes('@ant-design')) return 'vendor-antd'
          if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 7331,
  },
})
