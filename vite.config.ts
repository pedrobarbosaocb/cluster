import { defineConfig } from 'vitest/config';

const API = process.env.API_PROXY ?? 'http://localhost:8787';

export default defineConfig({
  base: './',
  server: {
    proxy: { '/api': API, '/uploads': API },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
