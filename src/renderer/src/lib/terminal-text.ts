import {
  extractPasswordPromptLine as extractSharedPasswordPromptLine,
  isPasswordPromptLine as isSharedPasswordPromptLine,
  isTerminalCurrentlyAtPasswordPrompt as isSharedTerminalCurrentlyAtPasswordPrompt
} from '../../../shared/terminal-password-prompt'

export function parseSubterminalTabId(
  tabId: string
): { parentTabId: string; name: string } | undefined {
  const marker = '::subterminal::'
  const markerIndex = tabId.indexOf(marker)

  if (markerIndex === -1) return undefined

  const parentTabId = tabId.slice(0, markerIndex)
  const encodedName = tabId.slice(markerIndex + marker.length)

  try {
    return {
      parentTabId,
      name: decodeURIComponent(encodedName)
    }
  } catch {
    return {
      parentTabId,
      name: encodedName
    }
  }
}

export function normalizeTerminalControlText(value: string): string {
  const withoutControls = applyBackspaces(stripTerminalControlSequences(value))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  return removeControlCharacters(withoutControls)
}

export function stripTerminalControlSequences(value: string): string {
  let output = ''

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code !== 27) {
      output += value[index]
      continue
    }

    const next = value[index + 1]
    if (next === ']') {
      index += 2
      while (index < value.length) {
        if (value.charCodeAt(index) === 7) break
        if (value.charCodeAt(index) === 27 && value[index + 1] === '\\') {
          index += 1
          break
        }
        index += 1
      }
      continue
    }

    if (next === '[') {
      index += 1
      while (index + 1 < value.length) {
        index += 1
        const finalCode = value.charCodeAt(index)
        if (finalCode >= 64 && finalCode <= 126) break
      }
      continue
    }

    if (next === '(' || next === ')') {
      index += 2
      continue
    }

    if (next === '=' || next === '>') {
      index += 1
      continue
    }

    index += 1
  }

  return output
}

export function extractPasswordPromptLine(output: string): string | null {
  return extractSharedPasswordPromptLine(stripTerminalControlSequences(output))
}

export function isTerminalCurrentlyAtPasswordPrompt(output: string): boolean {
  return isSharedTerminalCurrentlyAtPasswordPrompt(stripTerminalControlSequences(output))
}

export function isPasswordPromptLine(line: string): boolean {
  return isSharedPasswordPromptLine(line)
}

export function hasInteractivePrompt(output: string): boolean {
  const normalizedOutput = stripTerminalControlSequences(output).replace(/\r/g, '\n')
  const lines = normalizedOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  // Only the NEWEST non-empty line decides: a password/yes-no prompt that was
  // answered still stays in older lines, so scanning the whole tail would keep
  // a logged-in terminal looking interactive forever.
  const lastLine = lines[lines.length - 1] ?? ''
  if (!lastLine) return false
  if (/(yes\/no|continue connecting)/i.test(lastLine)) return true
  return isSharedPasswordPromptLine(lastLine)
}

function applyBackspaces(value: string): string {
  let output = ''

  for (const char of value) {
    if (char === '\b') {
      output = output.slice(0, -1)
      continue
    }
    output += char
  }

  return output
}

function removeControlCharacters(value: string): string {
  let output = ''

  for (const char of value) {
    const code = char.charCodeAt(0)
    if (char === '\n' || char === '\t' || code >= 32) output += char
  }

  return output
}
