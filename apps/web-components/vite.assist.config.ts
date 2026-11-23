// Builds dist/db-assist.js: the help bar for any page, as one classic script (also the extension's content script).
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { include: ['@db/shared-schemas'] },
  build: {
    emptyOutDir: false,
    commonjsOptions: { include: [/shared-schemas/, /node_modules/] },
    lib: {
      entry: 'src/assist/index.ts',
      name: 'DigitalBridgeAssistBar',
      formats: ['iife'],
      fileName: () => 'db-assist.js',
    },
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
});
