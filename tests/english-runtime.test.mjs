import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';

// Scan runtime sources, not documentation or binary model/font assets. Include
// nested modules, templates, styles and data so dynamic UI/API text is covered.
async function runtimeSources(directory) {
  const entries = await readdir(directory, {withFileTypes:true});
  const files = await Promise.all(entries.map(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? runtimeSources(url) :
      /\.(?:[cm]?js|[cm]?ts|jsx|tsx|html|css|json|svg|txt)$/.test(entry.name) || entry.name === '_headers' ? [url] : [];
  }));
  return files.flat();
}

test('Chinese UI copy is centralized in the locale catalog; protocol and model sources stay language-neutral', async () => {
  const files = (await Promise.all(['../pages/', '../worker/src/'].map(path => runtimeSources(new URL(path, import.meta.url))))).flat();
  assert.ok(files.some(url => url.pathname.endsWith('/full-brain/worker.mjs')), 'nested browser modules must be scanned');
  assert.ok(files.some(url => url.pathname.endsWith('/worker/src/flydesk-auth.mjs')), 'API messages must be scanned');
  const violations = [];
  for (const file of files) {
    if(file.pathname.endsWith('/pages/locales/zh-CN.js'))continue;
    const source = await readFile(file, 'utf8');
    // Decode common literal escapes too: moving Chinese into escapes is not a fix.
    const decoded = source.replace(/\\u\{([\da-f]+)\}|\\u([\da-f]{4})|&#x([\da-f]+);|&#(\d+);/gi,
      (match, braced, unicode, hex, decimal) => {
        const point = decimal ? Number(decimal) : parseInt(braced || unicode || hex, 16);
        return point <= 0x10ffff ? String.fromCodePoint(point) : match;
      });
    decoded.split('\n').forEach((line, index) => {
      // The language selector displays its native autonym in either language.
      if (/\p{Script=Han}/u.test(line.replaceAll('简体中文',''))) violations.push(`${file.pathname}:${index + 1}`);
    });
  }
  assert.deepEqual(violations, [], 'Put translated UI copy in the locale catalog: ' + violations.join(', '));
});

test('locale-sensitive formatting explicitly chooses the active UI locale or stable English protocol format', async () => {
  const files = (await Promise.all(['../pages/', '../worker/src/'].map(path => runtimeSources(new URL(path, import.meta.url))))).flat();
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/\b(?:toLocale(?:Date|Time)?String|Intl\.(?:DateTimeFormat|NumberFormat))\s*\(\s*([^)]*)\)/g)) {
      if (!/^(?:['"](?:en|zh)(?:-[A-Za-z]+)*['"](?:\s*,|\s*$)|locale\()/.test(match[1])) violations.push(`${file.pathname}: ${match[0]}`);
    }
  }
  assert.deepEqual(violations, []);
});
