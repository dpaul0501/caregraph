import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { apiPlugin } from './server/api.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss(), apiPlugin(env)],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 8080,
      proxy: { '/tel': { target: 'http://localhost:8787', changeOrigin: true, rewrite: (p) => p.replace(/^\/tel/, '') } },
    },
    test: { include: ['tests/**/*.test.ts'] },
  };
});
