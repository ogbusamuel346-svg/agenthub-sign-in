import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {defineConfig} from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, '.'),
      },
    },
    server: {
      // Let the local preview UI use the preview Worker API. This keeps local
      // testing on Paystack's test environment and the preview D1 database.
      proxy: mode === 'preview' ? {
        '/api': {
          target: 'https://sameduhub-api-preview.ogbusamuelagbaji.workers.dev',
          changeOrigin: true,
          secure: true,
        },
      } : undefined,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
