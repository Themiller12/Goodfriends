import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      '@': resolve(__dirname, './src')
    },
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json']
  },
  define: {
    global: 'globalThis',
    __DEV__: true
  },
  optimizeDeps: {
    include: ['react-native-web']
  },
  server: {
    port: 3000,
    host: true
  }
});