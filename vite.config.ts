import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
/// <reference types="vitest" />

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              // Separate React and related libraries
              'react-vendor': ['react', 'react-dom', 'react-router-dom'],
              // TON blockchain libraries
              'ton-vendor': ['@tonconnect/sdk', '@tonconnect/ui-react'],
              // Media libraries
              'media-vendor': ['react-player', 'lucide-react'],
              // Utility libraries
              'utils-vendor': ['tailwindcss'],
            },
          },
        },
        // Increase chunk size warning limit since we have large media libraries
        chunkSizeWarningLimit: 1000,
      },
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
      },
    };
});
