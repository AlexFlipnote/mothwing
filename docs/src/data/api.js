/*
  The API reference, read from mothwing's own source by the TypeScript compiler: what the package exports, with the
  types and JSDoc it has in src. Each export is an item of {{ api }}, pages/api/[api.slug].html makes a page of each.
*/
import path from "path"
import { fileURLToPath } from "url"
import ts from "typescript"
import { escapeHtml } from "mothwing/html"

const root = path.resolve(fileURLToPath(import.meta.url), "../../../..")
const docsSrc = path.join(root, "docs/src")

// The package's entry points, as package.json exports them
const ENTRIES = { "mothwing": "src/index.js", "mothwing/html": "src/html.js" }

/** What a kind of export is called on its page */
const KINDS = { function: "Function", class: "Class", type: "Type", callback: "Callback type" }

const FLAGS = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope

/**
 * @param {string} text JSDoc text
 * @returns {string} As HTML, with `code` as <code>
 */
const prose = (text) => escapeHtml(text.trim()).replace(/`([^`]+)`/g, "<code>$1</code>")

/**
 * @param {string} text JSDoc text
 * @returns {string} Its first sentence as plain text, for the page's description
 */
const summary = (text) => text.trim().split(/(?<=\.)\s/)[0].replaceAll("`", "")

/**
 * @param {string} code A type or signature as TypeScript prints it
 * @returns {string} Without the `| undefined` that every optional value has in strict mode, `?` says it already
 */
const tidy = (code) => {
  // Again until none are left, an object's own optional values are inside the match of the object
  const tidied = code.replace(/(\?: (?:[^;,(){}]|\([^()]*\)|\{[^{}]*\})*?) \| undefined/g, "$1")
  return tidied === code ? code : tidy(tidied)
}

/**
 * @typedef {object} Param
 * @property {string} name
 * @property {boolean} optional
 * @property {string} type
 * @property {string} description
 *
 * @typedef {object} Signature
 * @property {string} code
 * @property {Param[]} params
 * @property {string} returns
 * @property {string} returnsDescription
 *
 * @typedef {object} Item
 * @property {string} name
 * @property {keyof KINDS} kind
 * @property {string} kindName
 * @property {string[]} modules
 * @property {string} description
 * @property {string} summary
 * @property {string} file
 * @property {number} line
 * @property {string[]} sources
 * @property {Signature[]} [signatures]
 * @property {Param[]} [properties]
 */

/** @returns {Item[]} */
export default () => {
  const program = ts.createProgram(Object.values(ENTRIES).map(file => path.join(root, file)), {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    types: ["node"],
    skipLibCheck: true
  })
  const checker = program.getTypeChecker()

  /**
   * @param {ts.Type} type
   * @param {boolean} [optional] Leaves out the undefined that `?` already says
   */
  const typeText = (type, optional) => {
    const types = optional && type.isUnion() ? type.types.filter(t => !(t.flags & ts.TypeFlags.Undefined)) : [type]
    // A union of literals like false | true is printed as boolean once together
    if (types.length > 1 && types.every(t => t.flags & ts.TypeFlags.BooleanLiteral)) return "boolean"
    return tidy(types.map(t => checker.typeToString(t, undefined, FLAGS)).join(" | ").replace("false | true", "boolean"))
  }

  /** @param {ts.Symbol} symbol */
  const docs = (symbol) => ts.displayPartsToString(symbol.getDocumentationComment(checker))

  /**
   * @param {string} name
   * @param {ts.Signature} sig
   * @returns {Signature}
   */
  const signature = (name, sig) => {
    const returns = sig.getJsDocTags().find(tag => tag.name === "returns")
    return {
      code: `${name}${tidy(checker.signatureToString(sig, undefined, FLAGS))}`,
      params: sig.getParameters().map((param, i) => {
        const declaration = /** @type {ts.ParameterDeclaration | undefined} */ (param.valueDeclaration)
        const optional = Boolean(declaration && checker.isOptionalParameter(declaration))
        // A destructured parameter, `{ host, port } = {}`, has no name of its own, its @param gives it one
        const tag = declaration && ts.isObjectBindingPattern(declaration.name)
          ? ts.getJSDocTags(declaration.parent).filter(ts.isJSDocParameterTag)[i]
          : undefined
        return {
          name: tag ? tag.name.getText() : declaration?.dotDotDotToken ? `...${param.name}` : param.name,
          optional,
          type: typeText(checker.getTypeOfSymbol(param), optional),
          description: prose(tag ? ts.getTextOfJSDocComment(tag.comment) ?? "" : docs(param))
        }
      }),
      returns: typeText(sig.getReturnType()),
      returnsDescription: prose(ts.displayPartsToString(returns?.text))
    }
  }

  /**
   * @param {ts.Symbol} symbol
   * @param {string} module
   * @returns {Item}
   */
  const describe = (symbol, module) => {
    const declaration = symbol.declarations?.[0]
    if (!declaration) throw new Error(`api: ${symbol.name} has no declaration`)
    const sourceFile = declaration.getSourceFile()
    const file = path.relative(root, sourceFile.fileName).replaceAll("\\", "/")
    /** @param {keyof KINDS} kind */
    const base = (kind) => ({
      name: symbol.name,
      kind,
      kindName: KINDS[kind],
      modules: [module],
      description: prose(docs(symbol)),
      // An export without docs still needs a description for <x-seo>
      summary: summary(docs(symbol)) || `${KINDS[kind]} ${symbol.name}, from ${module}`,
      file,
      line: sourceFile.getLineAndCharacterOfPosition(declaration.getStart()).line + 1,
      // Each page is dated by the file it documents, relative to docs/src
      sources: [path.relative(docsSrc, sourceFile.fileName).replaceAll("\\", "/")]
    })

    if (symbol.flags & ts.SymbolFlags.Class) {
      const type = checker.getTypeOfSymbol(symbol)
      return { ...base("class"), signatures: type.getConstructSignatures().map(sig => signature(`new ${symbol.name}`, sig)) }
    }

    if (symbol.flags & ts.SymbolFlags.TypeAlias) {
      const type = checker.getDeclaredTypeOfSymbol(symbol)
      const calls = type.getCallSignatures()
      if (calls.length) return { ...base("callback"), signatures: calls.map(sig => signature(symbol.name, sig)) }
      return {
        ...base("type"),
        properties: type.getProperties().map(prop => {
          const optional = Boolean(prop.flags & ts.SymbolFlags.Optional)
          return { name: prop.name, optional, type: typeText(checker.getTypeOfSymbol(prop), optional), description: prose(docs(prop)) }
        })
      }
    }

    const type = checker.getTypeOfSymbol(symbol)
    return { ...base("function"), signatures: type.getCallSignatures().map(sig => signature(symbol.name, sig)) }
  }

  /** @type {Map<ts.Symbol, Item>} */
  const items = new Map()
  for (const [module, file] of Object.entries(ENTRIES)) {
    const source = program.getSourceFile(path.join(root, file))
    const moduleSymbol = source && checker.getSymbolAtLocation(source)
    if (!moduleSymbol) throw new Error(`api: can't read ${file}`)

    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      // index.js passes the typedefs on as `@typedef {import("./config.js").Config} Config`, the docs are on the original
      const original = symbol.flags & ts.SymbolFlags.TypeAlias
        ? checker.getDeclaredTypeOfSymbol(symbol).aliasSymbol ?? symbol
        : symbol
      const known = items.get(original)
      if (known) known.modules.push(module)
      else items.set(original, describe(original, module))
    }
  }

  const list = [...items.values()].sort((a, b) => a.name.localeCompare(b.name))
  // The class Html and the function html would be one folder on Windows and macOS, so a name that's taken apart from
  // its case gets its kind too: /api/html/ and /api/Html-class/
  const lower = list.map(item => item.name.toLowerCase())
  /** @type {Map<string, string>} */
  const slugs = new Map(list.map((item, i) => [
    item.name,
    lower.indexOf(lower[i]) === i ? item.name : `${item.name}-${item.kind}`
  ]))
  /**
   * @param {string} code
   * @returns {string} As HTML, the documented types in it linking to their pages
   */
  const linked = (code) => escapeHtml(code).replace(/\b[A-Z]\w*\b/g, word => slugs.has(word) ? `<a href="/api/${slugs.get(word)}/">${word}</a>` : word)

  // Both lists on every item, empty when it has none, as <x-each> takes only lists
  return list.map(item => ({
    ...item,
    slug: slugs.get(item.name),
    signatures: (item.signatures ?? []).map(sig => ({
      ...sig,
      code: linked(sig.code),
      params: sig.params.map(param => ({ ...param, type: linked(param.type) })),
      returns: linked(sig.returns)
    })),
    properties: (item.properties ?? []).map(prop => ({ ...prop, type: linked(prop.type) }))
  }))
}
