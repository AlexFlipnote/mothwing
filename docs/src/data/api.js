/* The API reference, read from src by the TypeScript compiler: each export is an item of {{ api }} */
import path from "path"
import { fileURLToPath } from "url"
import ts from "typescript"
import { escapeHtml } from "mothwing/html"

const root = path.resolve(fileURLToPath(import.meta.url), "../../../..")
const docsSrc = path.join(root, "docs/src")

const ENTRIES = { "mothwing": "src/index.js", "mothwing/html": "src/html.js" }

const KINDS = { function: "Function", class: "Class", type: "Type", callback: "Callback type" }

// Types TypeScript has built in, coloured apart from the ones named in mothwing or Node
const BUILT_IN = /\b(string|number|boolean|null|undefined|any|unknown|void|never|object|true|false)\b/

/** Signatures longer than this put each parameter on a line of its own */
const MAX_LINE = 60

/**
 * @param {string} code A signature, from its "("
 * @returns {string} Its parameters one per line when it's too long for one, like a formatter would
 */
const wrap = (code) => {
  if (code.length <= MAX_LINE) return code
  /** @type {string[]} */
  const params = []
  let depth = 0
  let start = 1
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (c === "=" && code[i + 1] === ">") i++
    else if ("([{<".includes(c)) depth++
    else if (")]}>".includes(c)) {
      depth--
      if (depth === 0) {
        params.push(code.slice(start, i).trim())
        return params[0] ? `(\n  ${params.join(",\n  ")}\n${code.slice(i)}` : code
      }
    } else if (c === "," && depth === 1) {
      params.push(code.slice(start, i).trim())
      start = i + 1
    }
  }
  return code
}

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
 * @typedef {Param & { method: boolean }} Member A type's property, or a class's, where `type` is a method's signature
 *
 * @typedef {object} Signature
 * @property {string} name What it's called by, `new Html` for a class
 * @property {string} code From its "(", the parameters and what it returns
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
 * @property {Member[]} [properties]
 */

/** @type {ReturnType<typeof read> | undefined} */
let cached

/** The reference, read once per render, as pages/api/index.data.js uses it too */
export default () => cached ??= read()

function read() {
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
   * @param {ts.Symbol} prop
   * @returns {Member}
   */
  const member = (prop) => {
    const optional = Boolean(prop.flags & ts.SymbolFlags.Optional)
    const method = Boolean(prop.flags & ts.SymbolFlags.Method)
    const type = method
      ? checker.getTypeOfSymbol(prop).getCallSignatures().map(sig => tidy(checker.signatureToString(sig, undefined, FLAGS))).join("\n")
      : typeText(checker.getTypeOfSymbol(prop), optional)
    return { name: prop.name, optional, method, type, description: prose(docs(prop)) }
  }

  /**
   * @param {string} name
   * @param {ts.Signature} sig
   * @returns {Signature}
   */
  const signature = (name, sig) => {
    const returns = sig.getJsDocTags().find(tag => tag.name === "returns")
    return {
      name,
      code: wrap(tidy(checker.signatureToString(sig, undefined, FLAGS))),
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
      sources: [path.relative(docsSrc, sourceFile.fileName).replaceAll("\\", "/")]
    })

    if (symbol.flags & ts.SymbolFlags.Class) {
      const type = checker.getTypeOfSymbol(symbol)
      return {
        ...base("class"),
        signatures: type.getConstructSignatures().map(sig => signature(`new ${symbol.name}`, sig)),
        // What an instance has, #private ones aren't in it
        properties: checker.getDeclaredTypeOfSymbol(symbol).getProperties().map(member)
      }
    }

    if (symbol.flags & ts.SymbolFlags.TypeAlias) {
      const type = checker.getDeclaredTypeOfSymbol(symbol)
      const calls = type.getCallSignatures()
      if (calls.length) return { ...base("callback"), signatures: calls.map(sig => signature(symbol.name, sig)) }
      return {
        ...base("type"),
        properties: type.getProperties().map(member)
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
  const token = new RegExp(`("[^"]*")|${BUILT_IN.source}|\\b([A-Z]\\w*)\\b`, "g")
  /**
   * @param {string} code
   * @returns {string} As HTML, coloured, the documented types in it linking to their pages
   */
  const linked = (code) => {
    let html = ""
    let last = 0
    for (const match of code.matchAll(token)) {
      const [whole, text, builtIn, name] = match
      const at = match.index ?? 0
      html += escapeHtml(code.slice(last, at))
      last = at + whole.length
      if (text) html += `<span class="literal">${escapeHtml(text)}</span>`
      else if (builtIn) html += `<span class="built-in">${builtIn}</span>`
      else if (slugs.has(name)) html += `<a href="/api/${slugs.get(name)}/">${name}</a>`
      else html += `<span class="type">${name}</span>`
    }
    return html + escapeHtml(code.slice(last))
  }

  // Both lists on every item, empty when it has none, as <x-each> takes only lists
  return list.map(item => {
    const slug = /** @type {string} */ (slugs.get(item.name))
    /**
     * @param {string} name
     * @param {boolean} link
     */
    const named = (name, link) => {
      const [keyword, own] = name.startsWith("new ") ? ["new ", name.slice(4)] : ["", name]
      const label = link ? `<a href="/api/${slug}/">${own}</a>` : own
      return `${keyword && `<span class="keyword">${keyword.trim()}</span> `}<span class="name">${label}</span>`
    }
    const signatures = (item.signatures ?? []).map(sig => ({
      ...sig,
      code: named(sig.name, false) + linked(sig.code),
      // On the reference, where the name links to the export's own page
      head: named(sig.name, true) + linked(sig.code),
      params: sig.params.map(param => ({ ...param, type: linked(param.type) })),
      returns: linked(sig.returns)
    }))
    return {
      ...item,
      slug,
      signatures,
      // A type has no signature, it's shown by its name
      heads: signatures.length ? signatures.map(sig => sig.head) : [`<span class="keyword">type</span> ${named(item.name, true)}`],
      properties: (item.properties ?? []).map(prop => ({
        ...prop,
        type: linked(prop.type),
        // `name?: type` for a value, `name(...): type` for a method
        head: `<span class="name">${prop.name}</span>${prop.optional ? "?" : ""}${prop.method ? "" : ": "}${linked(prop.type)}`
      })),
      propertiesTitle: item.kind === "class" ? "Members" : "Properties"
    }
  })
}
