// Gera src/landing/landing.css a partir de Work/src/styles.css,
// escopando todas as regras sob .landing-root para não vazar ao app principal.
// Versão mais robusta: faz parsing simples para balancear chaves e preservar at-rules.
import fs from 'fs';

let css = fs.readFileSync('Work/src/styles.css', 'utf8');

// Remove @import (fontes serão carregadas via link na landing)
css = css.replace(/@import[^;]*;/g, '');

function scopeSelector(sel) {
  return sel.split(',').map(s => {
    s = s.trim();
    if (!s) return '';
    if (s === 'html' || s === 'body') return '.landing-root';
    if (s === '*') return '.landing-root *';
    if (s === ':root') return ':root, .landing-root';
    return '.landing-root ' + s;
  }).filter(Boolean).join(', ');
}

function findMatchingBrace(str, startIndex) {
  let depth = 0;
  const len = str.length;
  for (let i = startIndex; i < len; i++) {
    const ch = str[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function processCss(src) {
  let out = '';
  let i = 0;
  const len = src.length;

  while (i < len) {
    // copy whitespace/comments until next token
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      const block = src.slice(i, end >= 0 ? end + 2 : len);
      out += block;
      i += block.length;
      continue;
    }

    // skip leading whitespace
    if (/[\t\n\r\f\s]/.test(src[i])) { out += src[i++]; continue; }

    if (src[i] === '@') {
      // at-rule: either ends with ; or has a block { ... }
      const atNameEnd = src.indexOf('{', i);
      const semi = src.indexOf(';', i);
      if (semi !== -1 && (atNameEnd === -1 || semi < atNameEnd)) {
        // at-rule without block
        out += src.slice(i, semi + 1);
        i = semi + 1;
        continue;
      }
      if (atNameEnd !== -1) {
        // at-rule with block: copy whole block preserving nested braces
        const end = findMatchingBrace(src, atNameEnd);
        if (end === -1) {
          // malformed CSS — copy rest and break
          out += src.slice(i);
          break;
        }
        out += src.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      // fallback: copy rest
      out += src.slice(i);
      break;
    }

    // Regular rule: selector { body }
    const brace = src.indexOf('{', i);
    if (brace === -1) {
      // no more rules
      out += src.slice(i);
      break;
    }
    const selector = src.slice(i, brace).trim();
    const end = findMatchingBrace(src, brace);
    if (end === -1) {
      // malformed: append rest and break
      out += src.slice(i);
      break;
    }
    const body = src.slice(brace + 1, end);

    // scope the selector(s)
    const scoped = scopeSelector(selector);
    if (scoped) {
      out += scoped + ' {' + body + '}';
    } else {
      // if scoping produced nothing (e.g., empty selector), skip
    }

    i = end + 1;
  }

  return out;
}

const scopedCss = processCss(css);

const header = '/* Landing page Flor da Pele — portada do backup Work/src/styles.css (escopo .landing-root) */\n';
fs.writeFileSync('src/landing/landing.css', header + scopedCss);
console.log('OK — bytes gerados:', scopedCss.length);
