import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-96x96.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'sofar — 실시간 싱크 가사 오디오 스트리밍',
        short_name: 'sofar',
        description: '듣고 싶던 모든 음악, 실시간 가사와 함께 편안하게. 유튜브 기반 미니멀 웹 오디오 플레이어',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // 정적 빌드 에셋 캐싱 대상
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        // 백엔드 API 및 외부 URL은 SPA 내비게이션 폴백에서 제외
        navigateFallbackDenylist: [/^\/api/, /^https:\/\/www\.youtube\.com/],
        runtimeCaching: [
          {
            // YouTube IFrame, 미디어 스트림 및 썸네일: 정책 준수를 위해 캐시하지 않고 항상 네트워크 직접 호출
            urlPattern: /^https:\/\/(www\.)?(youtube\.com|googlevideo\.com|ytimg\.com|i\.ytimg\.com)/i,
            handler: 'NetworkOnly'
          },
          {
            // Supabase 백엔드 API 및 인증: 실시간 데이터 정합성을 위해 항상 네트워크 직접 호출
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly'
          },
          {
            // 구글 폰트: 빠른 초기 렌더링을 위해 StaleWhileRevalidate 적용
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1년
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/llm': {
        target: 'http://127.0.0.1:1234',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm/, '')
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
