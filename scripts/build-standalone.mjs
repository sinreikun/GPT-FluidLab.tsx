import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
let html = await readFile(resolve(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)];
if (scripts.length !== 1 || styles.length !== 1) {
  throw new Error('Expected one JavaScript bundle and one stylesheet.');
}
for (const [tag, source] of scripts) {
  const code = await readFile(resolve(dist, source.replace(/^\//, '')), 'utf8');
  html = html.replace(tag, () => `<script type="module">${code.replace(/<\/script/gi, '<\\/script')}</script>`);
}
for (const [tag, source] of styles) {
  const css = await readFile(resolve(dist, source.replace(/^\//, '')), 'utf8');
  html = html.replace(tag, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
}
if (/<(?:script|link)\b[^>]*(?:src|href)="/i.test(html)) {
  throw new Error('The HTML still references an external script or stylesheet.');
}
await writeFile(resolve(dist, 'index.html'), html);
await writeFile(resolve(root, 'cell-fluid-lab.html'), html);
console.log(`Self-contained HTML: cell-fluid-lab.html (${Buffer.byteLength(html).toLocaleString()} bytes)`);
