import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Pi packages are ESM-only. Keep them external and load via dynamic `import()`
 * (see src/main/agent/pi-sdk.ts). Do not static-import them into the CJS main bundle.
 */
const piPackages = [
  '@earendil-works/pi-coding-agent',
  '@earendil-works/pi-agent-core',
  '@earendil-works/pi-ai',
  '@earendil-works/pi-tui',
  '@earendil-works/pi-telemetry',
  '@earendil-works/pi-client',
  '@earendil-works/pi-protocol',
  '@silvia-odwyer/photon-node',
  '@mariozechner/clipboard',
  '@modelcontextprotocol/sdk'
]

function posixId(id: string): string {
  return id.replaceAll('\\', '/')
}

function nodeModuleName(id: string): string | undefined {
  const normalized = posixId(id)
  const marker = '/node_modules/'
  const index = normalized.lastIndexOf(marker)
  if (index === -1) return undefined
  const rest = normalized.slice(index + marker.length)
  if (rest.startsWith('@')) {
    const [scope, name] = rest.split('/')
    return name ? `${scope}/${name}` : undefined
  }
  return rest.split('/')[0]
}

function rendererManualChunks(id: string): string | undefined {
  const pkg = nodeModuleName(id)
  if (pkg) {
    if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'react-vendor'
    if (pkg === 'lucide-react') return 'lucide-vendor'
    if (pkg === 'radix-ui' || pkg.startsWith('@radix-ui/')) return 'radix-vendor'
    if (pkg === 'recharts') return 'recharts-vendor'
    if (pkg === '@xyflow/react' || pkg === '@xyflow/system') return 'xyflow-vendor'
    if (pkg === 'd3' || pkg.startsWith('d3-')) return 'd3'
    // Keep mermaid/katex/cytoscape/xyflow lazy splits. Packing them undoes diagram code-splitting.
    return undefined
  }

  const normalized = posixId(id)
  // Keep optional surfaces and their media outside the initial UI chunk.
  if (
    /\/components\/(WhaleMonitor|whale\/|WikiSheet|SkillManager|SettingsSheet|McpServersSheet|HistoryPanel|LocalDocumentsSheet|LocalPdfPreview|MemoryCenter|CodeIntelligenceSettings)/.test(
      normalized
    )
  ) {
    return undefined
  }
  if (normalized.includes('/src/renderer/src/App.tsx')) return 'renderer-ui'
  if (normalized.includes('/src/renderer/src/i18n/')) return 'i18n'
  // ChartBlock / ArchitectureBlock load on demand so heavy diagram libs stay out of renderer-ui.
  if (
    normalized.includes('/src/renderer/src/components/ChartBlock') ||
    normalized.includes('/src/renderer/src/components/ui/chart') ||
    normalized.includes('/src/renderer/src/components/ArchitectureBlock') ||
    normalized.includes('/src/renderer/src/components/architecture/')
  ) {
    return undefined
  }
  if (normalized.includes('/src/renderer/src/components/')) return 'renderer-ui'
  return undefined
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'code-index-worker': resolve('src/main/code-intelligence/worker.ts')
        },
        external: ['node-pty', ...piPackages],
        output: {
          // Main chunks resolve local window, IPC and worker entry paths relative to this directory.
          chunkFileNames: '[name]-[hash].js',
          // Keep shared helpers out of index.js so dynamically imported agent/ipc
          // does not create a circular require back into the main entry.
          manualChunks(id) {
            if (id.includes('/src/main/safe-ipc-send')) return 'safe-ipc-send'
            if (id.includes('/src/main/ipc-security')) return 'ipc-security'
            if (id.includes('/src/main/renderer-secrets')) return 'renderer-secrets'
            if (id.includes('/src/main/crescent-paths')) return 'crescent-paths'
            if (id.includes('/src/main/update/updater')) return 'updater'
            return undefined
          }
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          terminal: resolve('src/preload/terminal.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        // mermaid-parser.core ships an unminified langium bundle (~1.3MB).
        // The esm.min entry keeps architecture/git/pie parsers and stays under 1MB.
        '@mermaid-js/parser': resolve(
          'node_modules/@mermaid-js/parser/dist/mermaid-parser.esm.min.mjs'
        )
      }
    },
    plugins: [tailwindcss(), react()],
    build: {
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          terminal: resolve('src/renderer/terminal.html')
        },
        output: {
          manualChunks: rendererManualChunks
        }
      }
    }
  }
})
