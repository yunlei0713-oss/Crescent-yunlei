import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const localTests = process.env.CRESCENT_LOCAL_TESTS === '1'
const desktopTests = [
  '**/*.browser.test.ts',
  'src/main/terminal/external/live-iterm.test.ts',
  'src/main/terminal/external/electron-iterm.test.ts',
  'src/main/terminal/external/electron-proactive.test.ts',
  'src/main/agent/vision-live.test.ts'
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    // Native fixtures share one macOS display/focus/GPU surface. Keep that resource
    // exclusive, not all local tests: Node suites retain their parallel workers.
    // Each file still runs in its own isolated fork with its original timeout.
    projects: localTests
      ? [
          {
            extends: true,
            test: {
              name: 'unit',
              exclude: ['**/node_modules/**', 'dist/**', 'out/**', ...desktopTests]
            }
          },
          {
            extends: true,
            test: { name: 'desktop', include: desktopTests, maxWorkers: 1 }
          }
        ]
      : undefined,
    exclude: localTests
      ? ['**/node_modules/**', 'dist/**', 'out/**']
      : [
          '**/node_modules/**',
          'dist/**',
          'out/**',
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/__tests__/**'
        ]
  }
})
