import Parser from 'web-tree-sitter'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { CodeSymbol, CodeReference } from '../../shared/knowledge'
import { codeLanguage } from './language'
import { redactSensitiveText } from '../../shared/secret-redaction'

const runtimeRequire = createRequire(__filename)
const parsers = new Map<string, Promise<Parser>>()
/** Describe callable identity without capturing argument values or anonymous function bodies. */
function callableName(node: Parser.SyntaxNode): string | undefined {
  if (/^(?:identifier|property_identifier|word|command_name)$/.test(node.type)) return node.text
  if (/^(?:member_expression|attribute)$/.test(node.type)) {
    const object = node.childForFieldName('object'),
      property = node.childForFieldName('property') ?? node.childForFieldName('attribute')
    return object && property
      ? `${callableName(object) ?? '<expression>'}.${property.text}`
      : undefined
  }
  if (/^(?:call_expression|call)$/.test(node.type)) {
    const fn = node.childForFieldName('function')
    return fn ? `${callableName(fn) ?? '<anonymous>'}()` : undefined
  }
  return undefined
}
let initialized: Promise<void> | undefined
export async function parseCode(
  path: string,
  text: string
): Promise<{ symbols: CodeSymbol[]; references: CodeReference[]; errors: boolean }> {
  initialized ??= Parser.init().catch((error) => {
    initialized = undefined
    throw error
  })
  await initialized
  const language = codeLanguage(path)
  if (!language) throw new Error('Unsupported language')
  let ready = parsers.get(language)
  if (!ready) {
    ready = (async () => {
      const wasmRoot = dirname(runtimeRequire.resolve('tree-sitter-wasms/package.json'))
      const grammar = await Parser.Language.load(
        join(wasmRoot, 'out', `tree-sitter-${language}.wasm`)
      )
      const parser = new Parser()
      parser.setLanguage(grammar)
      parser.setTimeoutMicros(350_000)
      return parser
    })().catch((error) => {
      parsers.delete(language)
      throw error
    })
    parsers.set(language, ready)
  }
  // The synchronous parse/traversal has no awaits once the grammar is loaded.
  const parser = await ready
  let tree: Parser.Tree
  try {
    tree = parser.parse(text)
  } catch (error) {
    parser.reset()
    throw error
  }
  const symbols: CodeSymbol[] = []
  const references: CodeReference[] = []
  let visited = 0
  let limited = false
  const deadline = performance.now() + 180
  function visit(node: Parser.SyntaxNode, from?: string): void {
    if (
      limited ||
      ++visited > 80_000 ||
      symbols.length + references.length >= 12000 ||
      (visited % 256 === 0 && performance.now() > deadline)
    ) {
      limited = true
      return
    }
    const definition =
      /^(?:function_declaration|function_definition|class_declaration|class_definition|method_definition|interface_declaration|type_alias_declaration|variable_declarator|pair|block_mapping_pair)$/.test(
        node.type
      )
    const nameNode = node.childForFieldName('name') ?? node.childForFieldName('key')
    const name = nameNode
      ? redactSensitiveText(nameNode.text.replace(/^['"]|['"]$/g, '')).slice(0, 200)
      : undefined
    if (definition && name) {
      symbols.push({
        path,
        name,
        kind: node.type,
        start: node.startPosition.row + 1,
        end: node.endPosition.row + 1
      })
      if (/function|method|class/.test(node.type)) from = name
    }
    if (/^(?:call_expression|call|command)$/.test(node.type)) {
      const target = node.childForFieldName('function') ?? node.childForFieldName('name')
      const name = target ? callableName(target) : undefined
      if (name)
        references.push({
          path,
          name: redactSensitiveText(name).slice(0, 200),
          kind: 'call',
          line: node.startPosition.row + 1,
          from
        })
    }
    if (/^(?:import_statement|import_from_statement|export_statement)$/.test(node.type)) {
      const target = node.childForFieldName('source') ?? node.childForFieldName('module_name')
      if (target)
        references.push({
          path,
          name: redactSensitiveText(target.text.replace(/^['"]|['"]$/g, '')).slice(0, 200),
          kind: 'import',
          line: node.startPosition.row + 1
        })
    }
    if (/^(?:identifier|property_identifier)$/.test(node.type) && node.id !== nameNode?.id) {
      references.push({
        path,
        name: node.text.slice(0, 200),
        kind: 'reference',
        line: node.startPosition.row + 1,
        from
      })
    }
    for (const child of node.namedChildren) {
      if (limited) break
      visit(child, from)
    }
  }
  try {
    visit(tree.rootNode)
    return { symbols, references, errors: limited || tree.rootNode.hasError() }
  } finally {
    tree.delete()
  }
}
