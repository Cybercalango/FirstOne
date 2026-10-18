// Utilitários de impressão com identidade visual (papel timbrado) e logo.
import { supabase } from '../supabaseClient';

export const EMPRESA_PADRAO = {
  nome: 'Flor da Pele',
  slogan: 'Joias Folheadas',
  telefone: '',
  whatsapp: '',
  email: '',
  site: '',
  instagram: '',
  endereco: '',
  cidade_uf: '',
  cep: '',
  cnpj: '',
  logo_url: '',
};

let cacheEmpresa = null;
let promessaEmpresa = null;

// Busca (com cache de sessão) a configuração da empresa. Nunca lança:
// em falha devolve os padrões para a impressão continuar funcionando.
export async function getEmpresa() {
  if (cacheEmpresa) return cacheEmpresa;
  if (!promessaEmpresa) {
    promessaEmpresa = (async () => {
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('*')
          .eq('id', 1)
          .maybeSingle();
        if (error || !data) return EMPRESA_PADRAO;
        cacheEmpresa = { ...EMPRESA_PADRAO, ...data };
        return cacheEmpresa;
      } catch {
        return EMPRESA_PADRAO;
      }
    })();
  }
  return promessaEmpresa;
}

// Chamado após salvar em Cadastros Base → Empresa: invalida o cache.
export function setEmpresaCache(v) {
  cacheEmpresa = v ? { ...EMPRESA_PADRAO, ...v } : null;
  promessaEmpresa = cacheEmpresa ? Promise.resolve(cacheEmpresa) : null;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Escape para interpolar textos do app dentro do HTML gerado (romaneio etc.).
export const escHtml = esc;

// Logo como dataURL (funciona na janela de impressão mesmo sem rede/CORS).
// Aceita: URL http(s) (upload no Cadastros → Empresa) ou caminho relativo
// "/logo.png". Vazio → '' (timbrado usa apenas o nome em texto).
export async function logoParaDataUrl(url) {
  if (!url) return '';
  let alvo = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('http ' + r.status);
      return await blobParaDataUrl(await r.blob());
    } catch {
      return url; // fallback: deixa o navegador tentar carregar direto
    }
  }
  if (alvo.startsWith('/')) alvo = urlAbsoluta(alvo);
  const r = await fetch(alvo);
  if (!r.ok) throw new Error('logo não encontrado');
  return await blobParaDataUrl(await r.blob());
}

// Resolve caminhos absolutos ("/flor-mark.png") relativos ao BASE_URL do
// build (no GitHub Pages o site vive em /FirstOne/, então "/x.png" puro
// resultaria em 404). URLs http(s)/data passam direto.
export function urlAbsoluta(p) {
  if (/^(https?:|data:|blob:)/i.test(p)) return p;
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
  return p.startsWith('/') ? base.replace(/\/$/, '') + p : base + p;
}

// Marca d'água como dataURL (funciona na janela about:blank da impressão,
// cuja URL base é "about:" — caminho relativo puro não resolveria).
export async function marcaDaguaDataUrl(caminho = '/flor-mark.png') {
  try {
    const r = await fetch(urlAbsoluta(caminho));
    if (!r.ok) return '';
    return await blobParaDataUrl(await r.blob());
  } catch {
    return ''; // sem rede/arquivo: timbrado segue sem a marca (não quebra)
  }
}

async function blobParaDataUrl(blob) {
  return await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error('falha ao ler logo'));
    fr.readAsDataURL(blob);
  });
}

// Linha de contato do cabeçalho: "(83) 9... · WhatsApp" etc.
export function contatosEmpresa(e) {
  const l = [];
  const tel = [e.telefone, e.whatsapp ? `${e.whatsapp}${e.telefone ? '' : ' · WhatsApp'}` : ''].filter(Boolean).join(' · ');
  if (tel) l.push(tel);
  if (e.email) l.push(e.email);
  const web = [e.site, e.instagram ? `@${String(e.instagram).replace(/^@/, '')}` : ''].filter(Boolean).join(' · ');
  if (web) l.push(web);
  return l;
}

// Papel timbrado A4 reutilizável (cabeçalho com logo + faixa magenta,
// régua de identidade, rodapé com endereço/contato/CNPJ). Classes
// "doc-*" permitem montar o corpo do documento (romaneio etc.).
// `logoSrc`: URL do logo (dataURL ou http) — se vazio usa apenas o nome.
export function htmlPapelTimbrado({ corpo, titulo, empresa, logoSrc, marcaDagua = '/flor-mark.png' }) {
  const e = { ...EMPRESA_PADRAO, ...(empresa || {}) };
  const contatos = contatosEmpresa(e);
  // Marca d'água: só renderiza <img> se houver fonte (dataURL ou URL
  // absoluta). Em janela about:blank da impressão, caminho relativo
  // "/flor-mark.png" não resolve — quem chama deve passar dataURL via
  // marcaDaguaDataUrl(); aqui o fallback é a URL absoluta do próprio site.
  const marcaUrl = marcaDagua && /^(https?:|data:|blob:)/i.test(marcaDagua)
    ? marcaDagua
    : (typeof window !== 'undefined' ? window.location.origin + marcaDagua : '');
  const marcaHtml = marcaDagua
    ? `<img class="marca-dagua" src="${esc(marcaUrl || marcaDagua)}" alt="">`
    : '';
  const logoHtml = logoSrc
    ? `<img class="logo" src="${esc(logoSrc)}" alt="${esc(e.nome)}">`
    : `<div class="logo-texto">${esc(e.nome)}</div>`;
  const endLinha = [e.endereco, [e.cidade_uf, e.cep].filter(Boolean).join(' — CEP ')].filter(Boolean);
  const emitido = new Date().toLocaleDateString('pt-BR');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo || e.nome)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&family=Oswald:wght@300;400;500&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&display=swap" rel="stylesheet">
<style>
  :root { --magenta:#8E2A6E; --tinta:#4a3145; --suave:#8a7484; --fio:#e6d9e2; --accent:#f6ecf3; }
  * { box-sizing:border-box; }
  @page { size:A4; margin:0; }
  html,body { margin:0; padding:0; background:#fff; color:var(--tinta);
    font-family:'Open Sans',Arial,sans-serif; font-size:12px; -webkit-font-smoothing:antialiased; }
  .folha { display:flex; flex-direction:column; min-height:297mm; }
  .faixa { background:var(--magenta); height:8mm; width:100%; flex:none; }
  .cabecalho { display:flex; align-items:center; gap:18px; padding:10mm 16mm 6mm; }
  .cabecalho .logo { max-height:22mm; max-width:55mm; object-fit:contain; }
  .logo-texto { font-family:'Oswald','Arial Narrow',sans-serif; font-weight:500; text-transform:uppercase;
    letter-spacing:3px; font-size:22px; color:var(--magenta); }
  .cabecalho-info { margin-left:auto; text-align:right; }
  .linha-marca { margin:0 0 4px; font-family:'Oswald','Arial Narrow',sans-serif; font-weight:300;
    letter-spacing:2.5px; text-transform:uppercase; font-size:12px; color:var(--magenta); }
  .contatos { list-style:none; margin:0; padding:0; font-size:10.5px; color:var(--suave); line-height:1.55; }
  .regua { height:2px; margin:0 16mm; background:linear-gradient(90deg,var(--magenta),#d9a8c6 60%,transparent); flex:none; }
  .area-livre { flex:1; padding:10mm 16mm; position:relative; }
  .marca-dagua { position:absolute; top:50%; left:50%; transform:translate(-50%,-52%);
    width:120mm; height:120mm; object-fit:contain; opacity:.05; pointer-events:none; }
  .rodape { flex:none; border-top:1px solid var(--fio); margin:0 16mm; padding:6mm 0 4mm; }
  .rodape-grid { display:grid; grid-template-columns:1.2fr 1.4fr 1.4fr; gap:12px; align-items:start; }
  .marca-nome { display:block; font-family:'Oswald','Arial Narrow',sans-serif; font-weight:500;
    text-transform:uppercase; letter-spacing:3px; font-size:15px; color:var(--magenta); }
  .marca-sub { display:block; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--suave); }
  .rotulo { display:block; font-size:9px; letter-spacing:1.6px; text-transform:uppercase; color:var(--magenta); margin-bottom:2px; }
  .valor { display:block; font-size:10.5px; color:var(--tinta); line-height:1.5; }
  .alinhado-direita { text-align:right; }
  .rodape-legal { display:flex; justify-content:space-between; gap:10px; margin-top:5mm;
    font-size:9.5px; color:var(--suave); }
  /* ---- classes do conteúdo (doc-*) ---- */
  .doc-eyebrow { color:var(--magenta); font-size:10px; font-weight:700; letter-spacing:2.4px;
    text-transform:uppercase; margin:0 0 2px; display:flex; align-items:center; gap:10px; }
  .doc-eyebrow::before { content:''; width:23px; height:1px; background:var(--magenta); }
  .doc-titulo { font-family:'Playfair Display',Georgia,serif; font-weight:600; font-size:28px;
    line-height:1.1; margin:2px 0 6px; color:var(--tinta); }
  .doc-meta { color:var(--suave); font-size:11.5px; margin:0 0 18px; }
  .doc-meta strong { color:var(--tinta); font-weight:600; }
  .doc-tabela { border-collapse:collapse; width:100%; margin-top:4px; }
  .doc-tabela th { text-align:left; font-size:9.5px; letter-spacing:1.6px; text-transform:uppercase;
    color:var(--magenta); border-bottom:1px solid var(--magenta); padding:7px 9px; }
  .doc-tabela td { border-bottom:1px solid var(--fio); padding:8px 9px; font-size:12px; }
  .doc-tabela tbody tr:nth-child(even) td { background:var(--accent); }
  .doc-destaque { margin-top:14px; font-size:13px; }
  .doc-destaque strong { color:var(--magenta); }
  .doc-assinaturas { display:grid; grid-template-columns:1fr 1fr; gap:48px; margin-top:34mm; }
  .doc-assinatura { border-top:1px solid var(--fio); padding-top:7px; text-align:center;
    font-size:10.5px; letter-spacing:.4px; color:var(--suave); }
  .doc-nota { font-size:9.5px; color:var(--suave); margin-top:8px; }
  @media print { body { background:#fff; } .no-print { display:none !important; } }
</style></head><body>
<div class="folha">
  <div class="faixa" aria-hidden="true"></div>
  <header class="cabecalho">${logoHtml}
    <div class="cabecalho-info">
      <p class="linha-marca">${esc(e.slogan)}</p>
      <ul class="contatos">${contatos.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    </div>
  </header>
  <div class="regua" aria-hidden="true"></div>
  <main class="area-livre">${marcaHtml}${corpo || ''}</main>
  <footer class="rodape">
    <div class="rodape-grid">
      <div><span class="marca-nome">${esc(e.nome)}</span><span class="marca-sub">${esc(e.slogan)}</span></div>
      <div><span class="rotulo">Endereço</span>${endLinha.map((v) => `<span class="valor">${esc(v)}</span>`).join('')}</div>
      <div class="alinhado-direita"><span class="rotulo">Contato</span>${contatos.map((v) => `<span class="valor">${esc(v)}</span>`).join('')}</div>
    </div>
    <div class="rodape-legal"><span>CNPJ ${esc(e.cnpj || '—')}</span><span>Emitido em ${emitido}</span></div>
  </footer>
  <div class="faixa" aria-hidden="true"></div>
</div>
</body></html>`;
}
