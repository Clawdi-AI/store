import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: [
      'tests/**/*.real-ai.test.ts', // Skip real AI tests by default
      'tests/integration/extract.test.ts', // Skip complex CLI tests for now
      'tests/integration/audit.test.ts',   // Skip complex CLI tests for now  
      'tests/integration/report.test.ts'   // Skip complex CLI tests for now
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'scripts/',
        'experiments/'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
});