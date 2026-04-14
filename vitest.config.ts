import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Cho phép import foo.js resolve sang foo.ts (NodeNext compat)
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
    environment: 'node',
    testTimeout: 30000,
  },
});
