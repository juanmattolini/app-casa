import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// "single" mode: one self-contained HTML file for the shareable preview (no service worker).
// Default mode: installable PWA for hosting (GitHub Pages / Netlify).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    mode === 'single'
      ? viteSingleFile()
      : VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon.svg'],
          manifest: {
            name: 'Casa',
            short_name: 'Casa',
            description: 'Tareas de la casa con materiales y fotos',
            lang: 'es',
            start_url: './',
            display: 'standalone',
            background_color: '#eef1ee',
            theme_color: '#1d3a34',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
        }),
  ],
  build: { outDir: mode === 'single' ? 'dist-preview' : 'dist' },
}))
