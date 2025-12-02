import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Vercel deployment uses root path
    base: '/', 
    
    plugins: [react()],
    
    // Polyfill process.env.API_KEY with the VITE_ variable from Vercel Environment Variables
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY),
    },
    
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});