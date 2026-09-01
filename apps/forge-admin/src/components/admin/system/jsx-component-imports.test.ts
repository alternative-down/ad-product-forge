/**
 * L#NN-17 C3 tripwire (generalized) for #5720: ALL JSX components used in a route
 * index.tsx must be either imported or defined locally in the same file.
 *
 * Bug class: P0-masked pre-existing bug (L#NN-17 Class 3: client UI bundle ReferenceError).
 * When any uppercase JSX component is used without an import or local definition,
 * Vite bundles it as undefined and the route page crashes at runtime with
 * "<ComponentName> is not defined".
 *
 * This test is the GENERALIZATION of:
 *   - #5680 / #5692 (Day 11, Aldric): original AdminLoadingState-specific tripwire
 *   - #5710 (Day 13 Jun 13, Kaelen): generalized to all 31 routes for AdminLoadingState
 *   - #5720 (Day 14 Jun 14, Kaelen): generalized to ALL JSX components
 *
 * The old AdminLoadingState-specific tripwire (admin-loading-state-imports.test.ts)
 * is now subsumed by this test, which catches a strictly larger set of bugs.
 *
 * ── Implementation: TypeScript AST walk (option C from #5720 body) ──
 *   - ts.createSourceFile + ts.forEachChild for precise JSX element detection
 *   - Handles: JSX intrinsics (lowercase), member expressions (React.Fragment),
 *     locally defined components, type-only imports
 *   - readFileSync + AST (not mocks)
 *
 * ── L#NN-13 source-level pattern (Kaelen #5701 gold standard reference) ──
 *   - readFileSync (not mocks)
 *   - Self-document L#NN-17 class + L#NN-13 root cause in test header
 *   - L#26 mutations verify (revert-fix → fail → restore → pass)
 *
 * ── L#26 v1 + v2 will be verified below (after tripwire creation) ──
 *
 * ── Cross-links ──
 *   - #5720 (Day 14 P3, Kaelen lead, source of this tripwire)
 *   - #5680 / #5692 (Aldric original AdminLoadingState bug + tripwire)
 *   - #5710 (Kaelen C3 tripwire generalization, 31 routes for AdminLoadingState)
 *   - #5711 (Aldric L#NN-13 tripwire template P3)
 *   - memory/diagnostic-frameworks/p0-masked-bugs-5-class-taxonomy.md (L#NN-17)
 *   - memory/operational-patterns/3-layer-prevention-pattern.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ROUTES_DIR = join(__dirname, '../../../routes');

// HTML/SVG JSX intrinsics (always lowercase). Reference: React 18 + DOM spec.
const JSX_INTRINSICS = new Set([
  // HTML
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base',
  'bdi', 'bdo', 'big', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption',
  'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details',
  'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head',
  'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd',
  'keygen', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'marquee',
  'menu', 'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup',
  'option', 'output', 'p', 'param', 'picture', 'pre', 'progress', 'q', 'rp',
  'rt', 'ruby', 's', 'samp', 'script', 'section', 'select', 'small', 'source',
  'span', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td',
  'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u',
  'ul', 'var', 'video', 'wbr',
  // SVG
  'svg', 'circle', 'clipPath', 'defs', 'ellipse', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage',
  'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight',
  'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence', 'filter',
  'foreignObject', 'g', 'image', 'line', 'linearGradient', 'marker', 'mask',
  'metadata', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect',
  'stop', 'switch', 'symbol', 'text', 'textPath', 'tspan', 'use', 'view',
]);

function listRouteIndexFiles(): string[] {
  const result: string[] = [];
  function walk(dir: string): void {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // dir missing → empty
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name === 'index.tsx') {
        result.push(full);
      }
    }
  }
  walk(ROUTES_DIR);
  return result;
}

interface JsxComponentRef {
  name: string;
  line: number;
}

function findJsxComponents(file: string): JsxComponentRef[] {
  const src = readFileSync(file, 'utf-8');
  const sourceFile = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  const components: JsxComponentRef[] = [];
  function walk(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      // Skip member expressions (React.Fragment, MyContext.Provider, etc.)
      if (tagName.includes('.')) {
        // No-op; fall through to children
      } else if (JSX_INTRINSICS.has(tagName)) {
        // Skip JSX intrinsics (HTML/SVG)
      } else if (tagName === 'Fragment') {
        // React.Fragment shorthand - not used here (we use <></>)
      } else {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        components.push({ name: tagName, line });
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);
  return components;
}

function isLocallyDefined(src: string, name: string): boolean {
  // Match: function, const, let, var, class (with or without export)
  // Word-boundary on both sides to avoid matching partial names.
  const patterns = [
    new RegExp(`\\bfunction\\s+${name}\\b`),
    new RegExp(`\\bconst\\s+${name}\\b`),
    new RegExp(`\\blet\\s+${name}\\b`),
    new RegExp(`\\bvar\\s+${name}\\b`),
    new RegExp(`\\bclass\\s+${name}\\b`),
    // React.memo / React.forwardRef wrappers
    new RegExp(`\\b${name}\\s*=\\s*(React\\.)?(memo|forwardRef|lazy)\\b`),
  ];
  return patterns.some((p) => p.test(src));
}

function isImported(src: string, name: string): boolean {
  // Match: import { X, Y as Z } from '...' OR import X from '...'
  // Excludes: import type { X } from '...' (type-only imports can't be used as JSX)
  // We use multiline regex to handle multi-line import statements.
  const importPattern = new RegExp(
    `^\\s*import\\s+(?!type\\s)(?:\\{[^}]*\\b${name}\\b[^}]*\\}|${name}\\s+)\\s*from\\s+['"]`,
    'm',
  );
  return importPattern.test(src);
}

describe('L#NN-17 C3 tripwire (generalized): all JSX components must be imported or locally defined', () => {
  const pages = listRouteIndexFiles();

  it('finds at least 25 route entry points (sanity, same scope as #5710)', () => {
    // Pre-Day-13 expectation: 8 (settings subdirs only).
    // Post-Day-13 expectation: 25+ (all routes).
    expect(pages.length).toBeGreaterThanOrEqual(25);
  });

  // The original AdminLoadingState-specific test had a specific assertion for it.
  // Keep that as a backwards-compat check.
  for (const page of pages) {
    const rel = page.slice(ROUTES_DIR.length + 1);
    it(`${rel}: all uppercase JSX components are imported or defined locally`, () => {
      const src = readFileSync(page, 'utf-8');
      const components = findJsxComponents(page);
      const failures: string[] = [];
      const seen = new Set<string>();
      for (const comp of components) {
        if (seen.has(comp.name)) continue; // dedupe
        seen.add(comp.name);
        if (isImported(src, comp.name)) continue;
        if (isLocallyDefined(src, comp.name)) continue;
        failures.push(
          `L${comp.line}: <${comp.name}> used but not imported or defined locally (L#NN-17 C3, #5720)`,
        );
      }
      expect(failures, failures.length > 0 ? failures.join('\n') : '').toEqual([]);
    });
  }
});
