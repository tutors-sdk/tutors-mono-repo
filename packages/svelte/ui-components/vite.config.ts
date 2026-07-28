import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: 'src/styles.css',
      output: {
        assetFileNames: 'style.css'
      }
    }
  }
});
