import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Marvel Reading Guide',
        short_name: 'MRG',
        description: 'Reading-order guide for Marvel crossover events, teams, and characters.',
        theme_color: '#ed1d24',
        background_color: '#0b0b0e',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,json,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === 'i.annihil.us' ||
              url.hostname.endsWith('marvelfe.com') ||
              url.hostname.includes('marvel.com'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'marvel-covers',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
});
