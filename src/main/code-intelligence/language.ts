import { extname } from 'node:path'

const extensions: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.sh': 'bash',
  '.bash': 'bash',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml'
}

export function codeLanguage(path: string): string | undefined {
  return extensions[extname(path)]
}
