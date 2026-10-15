// Gera src/landing/landing.css a partir de Work/src/styles.css,
// escopando todas as regras sob .landing-root para não vazar ao app principal.
import fs from 'fs';

let css = fs.readFileSync('Work/src/styles.css', 'utf8');

// Remove @import (fontes serão carregadas via link na landing)
css = css.replace(/@import[^;]*;/g, '');

// Variáveis de tema: aplica em :root e .landing-root
css = css.replace(/:root\s*\{/g, ':root, .landing-root {');

function scopeSelector(sel) {
  return sel.split(',').map(s => {
    s = s.trim();
    if (!s) return s;
    if (s === 'html' || s === 'body') return '.landing-root';
    if (s === '*') return '.landing-root *';
    if (s === ':root') return ':root, .landing-root';
    return '.landing-root ' + s;
  }).join(', ');
}

function scopeRules(src) {
  // processa "seletores { corpo }" onde corpo não contém chaves
  return src.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, body) => {
    const trimmed = sel.trim();
    if (trimmed.startsWith('@')) return m;
    return scopeSelector(trimmed) + ' {' + body + '}';
  });
}

// Preserva @font-face e @keyframes sem escopo
const protectedBlocks = [];
css = css.replace(/@font-face\s*\{[^}]*\}/g, m => { protectedBlocks.push(m); return `@@KEEP${protectedBlocks.length - 1}@@`; });
css = css.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, m => { protectedBlocks.push(m); return `@@KEEP${protectedBlocks.length - 1}@@`; });

css = scopeRules(css);

css = css.replace(/@@KEEP(\d+)@@/g, (m, i) => protectedBlocks[Number(i)]);

const header = '/* Landing page Flor da Pele — portada do backup Work/src/styles.css (escopo .landing-root) */\n';
fs.writeFileSync('src/landing/landing.css', header + css);
console.log('OK — bytes gerados:', css.length);
