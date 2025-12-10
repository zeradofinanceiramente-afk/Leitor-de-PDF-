import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Carrega as variáveis de ambiente baseadas no modo (ex: .env, .env.production)
  // O terceiro argumento '' garante que carreguemos todas as variáveis, não apenas as com prefixo VITE_
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    optimizeDeps: {
      include: ['pdfjs-dist'],
      esbuildOptions: {
        target: 'esnext',
      },
    },
    build: {
      outDir: 'dist',
      target: 'esnext',
      rollupOptions: {
        output: {
          manualChunks: {
            ai: ['@google/genai'],
          },
        },
      },
    },
    server: {
      port: 3000
    },
    // Define variáveis globais para o código cliente
    define: {
      // Isso permite que o código use process.env.API_KEY pegando do ambiente de build do Cloudflare
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY || env.API_KEY),
    }
  };
});