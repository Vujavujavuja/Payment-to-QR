import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The app resolves "ips-qr" to the package's built dist. Tests point at
      // the source instead: they should fail on a broken source file rather
      // than on a stale build, and they should not need one to run.
      'ips-qr/qr': fileURLToPath(new URL('./packages/ips-qr/src/qr.ts', import.meta.url)),
      'ips-qr': fileURLToPath(new URL('./packages/ips-qr/src/index.ts', import.meta.url)),
      // src/extract imports core through the "@/" alias.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
