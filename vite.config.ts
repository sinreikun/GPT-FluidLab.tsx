import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], build: { modulePreload: false, assetsInlineLimit: Infinity, rollupOptions: { output: { inlineDynamicImports: true } } }, test: { include: ['src/**/*.test.ts'] } });
