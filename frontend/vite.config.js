import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
        
      srcDir: 'src',                 
      filename: 'sw.js',              
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],

      injectManifest: {               
        injectionPoint: undefined,
      },

      manifest: {
        name: 'Lynqo',
        short_name: 'Lynqo',
        description: 'Connect Beyond Chats',
        theme_color: '#7c3aed',
        background_color: '#050508',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})