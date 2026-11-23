/**
 * Zero-dependency Standalone HTML Bundler for Wirebench.
 * Walks the ES module graph from src/ui/app.js, transforms static import/export
 * statements into a clean scoped module registry, inlines CSS, and outputs dist/wirebench.html
 * so the entire studio can also be opened directly via file:// with zero server.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'src/ui/app.js');
const HTML_IN = path.join(ROOT, 'public/index.html');
const CSS_IN = path.join(ROOT, 'public/styles.css');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'wirebench.html');

const IMPORT_RE = /^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm;

function toModId(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/');
}

async function collectGraph(entryPath, visited = new Map()) {
  const abs = path.resolve(entryPath);
  const id = toModId(abs);
  if (visited.has(id)) return visited;

  const src = await fs.readFile(abs, 'utf8');
  const deps = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const depAbs = path.resolve(path.dirname(abs), m[2]);
    deps.push(depAbs);
  }
  visited.set(id, { id, abs, src });
  for (const d of deps) {
    await collectGraph(d, visited);
  }
  return visited;
}

function transformModule(mod) {
  const exportNames = [];
  let code = mod.src;

  // Rewrite relative static imports -> const { a, b } = __req("src/...");
  code = code.replace(IMPORT_RE, (_full, specifiers, relSpec) => {
    const depId = toModId(path.resolve(path.dirname(mod.abs), relSpec));
    const cleaned = specifiers.replace(/\s+as\s+/g, ': ');
    return `const {${cleaned}} = __req(${JSON.stringify(depId)});`;
  });

  // Rewrite `export function foo` / `export class Foo` / `export const BAR`
  code = code.replace(/^export\s+(async\s+)?function\s+([A-Za-z0-9_$]+)/gm, (_m, asyncKw, name) => {
    exportNames.push(name);
    return `${asyncKw || ''}function ${name}`;
  });
  code = code.replace(/^export\s+class\s+([A-Za-z0-9_$]+)/gm, (_m, name) => {
    exportNames.push(name);
    return `class ${name}`;
  });
  code = code.replace(/^export\s+(const|let|var)\s+([A-Za-z0-9_$]+)/gm, (_m, kw, name) => {
    exportNames.push(name);
    return `${kw} ${name}`;
  });

  const exportLines = exportNames.map((n) => `__exp.${n} = ${n};`).join('\n');
  return `__def(${JSON.stringify(mod.id)}, function(__exp, __req) {\n${code}\n${exportLines}\n});`;
}

async function build() {
  const graph = await collectGraph(ENTRY);
  const [html, css] = await Promise.all([
    fs.readFile(HTML_IN, 'utf8'),
    fs.readFile(CSS_IN, 'utf8'),
  ]);

  const moduleBodies = [];
  for (const mod of graph.values()) {
    moduleBodies.push(transformModule(mod));
  }

  const runtime = `(function() {
  const __registry = Object.create(null);
  const __cache = Object.create(null);
  function __def(id, factory) { __registry[id] = factory; }
  function __req(id) {
    if (__cache[id]) return __cache[id];
    const exp = {};
    __cache[id] = exp;
    __registry[id](exp, __req);
    return exp;
  }
${moduleBodies.join('\n\n')}
  __req(${JSON.stringify(toModId(ENTRY))});
})();`;

  // Escape any accidental </script> sequence inside code
  const safeRuntime = runtime.replace(/<\/script>/gi, '<\\/script>');

  const bundledHtml = html
    .replace('<link rel="stylesheet" href="/public/styles.css" />', `<style>\n${css}\n</style>`)
    .replace('<script type="module" src="/src/ui/app.js"></script>', `<script>\n${safeRuntime}\n</script>`);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, bundledHtml, 'utf8');
  const kb = (Buffer.byteLength(bundledHtml, 'utf8') / 1024).toFixed(1);
  console.log(`Built standalone bundle: dist/wirebench.html (${kb} KB, ${graph.size} modules)`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
