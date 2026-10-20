// Landing page + catálogo público "Flor da Pele"
// Portada do backup Work/ (TanStack Router) para o roteador atual (react-router-dom),
// sem Tailwind/Radix: primitivos locais em ./ui.jsx e CSS escopado em ./landing.css.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Heart, Search, Sparkles, Gift, Gem, X, SlidersHorizontal,
  MessageCircle, ShoppingBag, Loader2,
} from 'lucide-react';
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription } from './ui';
import { WhatsAppGlyph } from './whatsappSvg';
import { getEmpresa } from '../utils/empresa';
import logo from './assets/flor-da-pele-logo.png';
import editorial from './assets/jewelry-editorial.jpg';
import { listProducts, categories as baseCategories, formatPrice } from './catalog';
import './landing.css';
import './landing.override.css';

const categories = [...new Set([...baseCategories, 'Brincos', 'Colares', 'Pulseiras'])];

// OBS: o hook useIsMobile foi removido junto com o bloco desktop-nav.
// A régua de categorias do topo não é mais renderizada em NENHUM tamanho de
// tela (decisão feita direto no JSX), então não há mais uso de breakpoint JS
// aqui — o acesso a categorias segue por CSS responsivo + tabs/drawer.

export default function Landing() {
  const [products, setProducts] = useState(null); // null = carregando
  const [loadError, setLoadError] = useState('');
  const [category, setCategory] = useState('Todas as joias');
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem('fp_favoritas') || '[]'); } catch { return []; } });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [contact, setContact] = useState(false);
  const [sort, setSort] = useState('featured');
  const [menu, setMenu] = useState(false);
  // Número de WhatsApp da empresa (Cadastros Base → Empresa). Enquanto não
  // houver número configurado, "Fale com a gente" mantém o comportamento
  // antigo (abre o diálogo de contato).
  const [whatsapp, setWhatsapp] = useState('');
  const catalog = useRef(null);

  useEffect(() => {
    let alive = true;
    getEmpresa().then((e) => { if (alive) setWhatsapp(String(e?.whatsapp || '').replace(/\D/g, '')); });
    return () => { alive = false; };
  }, []);

  const waHref = whatsapp
    ? `https://wa.me/55${whatsapp.replace(/^55/, '')}`
    : '';
  const abrirContato = () => {
    if (waHref) window.open(waHref, '_blank', 'noopener');
    else setContact(true);
  };

  useEffect(() => {
    let alive = true;
    listProducts()
      .then((data) => { if (alive) setProducts(data); })
      .catch((e) => { if (alive) { setLoadError(String(e?.message || e)); setProducts([]); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    localStorage.setItem('fp_favoritas', JSON.stringify(favorites));
  }, [favorites]);

  const scrollToCatalog = () => catalog.current?.scrollIntoView({ behavior: 'smooth' });
  const toggleFavorite = (id) => setFavorites((cur) => (cur.includes(id) ? cur.filter((i) => i !== id) : [...cur, id]));

  const visible = useMemo(() => {
    const list = (products ?? []).filter(
      (p) =>
        (category === 'Todas as joias' || p.category === category) &&
        (!favoritesOnly || favorites.includes(p.id)) &&
        p.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')),
    );
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [products, category, favoritesOnly, favorites, query, sort]);

  return (
    <div className="landing-root">
      <div className="announcement">Um toque de brilho. Uma expressão de você. <Sparkles size={12} /></div>
      <header className="site-header page-width">
        <a href="/" className="logo-link" aria-label="Flor da Pele, início"><img src={logo} width={500} height={500} alt="Flor da Pele — Joias Folheadas" /></a>
        {/* Desktop E mobile: a régua de categorias da barra superior (desktop-nav)
            NUNCA é renderizada. Removida direto do JSX — não via CSS — porque:
            1) display:none neste projeto disputa especificidade/ordem entre
               landing.css e landing.override.css e a régua reaparecia;
            2) elemento ausente do DOM não pode ser reativado por CSS nem cache.
            Acesso a Anéis/Brincos/etc.: tabs do catálogo (desktop) e drawer ☰
            (mobile). A antiga condicional {!isMobile && ...} era a causa do
            sumiço só no celular — no desktop o bloco continuava montado. */}
        <div className="header-actions">
          <Button variant="ghost" size="icon" className="btn-search-mobile" aria-label="Buscar joias" title="Buscar joias" onClick={() => { setSearchOpen(!searchOpen); scrollToCatalog(); }}><Search /></Button>
          <Button variant="ghost" size="icon" aria-label="Ver favoritas" title="Ver favoritas" className="favorite-counter" onClick={() => { setFavoritesOnly(!favoritesOnly); scrollToCatalog(); }}>
            <Heart fill={favoritesOnly ? 'currentColor' : 'none'} />{favorites.length > 0 && <span>{favorites.length}</span>}
          </Button>
          <Button variant="ghost" className="nav-toggle" aria-label="Abrir menu" title="Menu" onClick={() => setMenu(true)}>
            <svg className="icon-menu" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M3.5 6h17M3.5 12h17M3.5 18h17" />
            </svg>
            <span className="menu-label">Menu</span>
          </Button>
          {/* "Fale com a gente": no MOBILE o texto é substituído pela logo do
              WhatsApp (SVG inline — sempre aparece, sem depender de arquivo);
              no DESKTOP continua o botão com ícone + texto. */}
          <Button variant="outline" className="contact-header" title="Fale com a gente" onClick={abrirContato}>
            <WhatsAppGlyph size={22} />
            <span className="contact-label"><MessageCircle size={16} /> Fale com a gente</span>
          </Button>
        </div>
      </header>
      <main>
        <section className="editorial-hero">
          <img className="hero-image" src={editorial} alt="Argolas douradas e colar delicado sobre um pedestal de pedra" width={1536} height={1024} />
          <div className="hero-inner page-width">
            <div className="hero-copy">
              <div className="eyebrow"><span /> JOIAS QUE CELEBRAM VOCÊ</div>
              <h1>Flor da Pele<span>Seu brilho,<br /><em>sua essência.</em></span></h1>
              <p>Detalhes que encantam. Joias folheadas que<br className="desktop-break" /> tornam o seu dia a dia ainda mais especial.</p>
              <Button className="hero-cta mobile-hide" onClick={scrollToCatalog}>Encontre sua joia <ArrowRight /></Button>
              <div className="hero-caption"><span /> Delicadeza em cada detalhe</div>
            </div>
          </div>
          <div className="collection-stamp">UM BRILHO<br /><em>naturalmente seu</em></div>
        </section>
        <div className="values-strip mobile-hide">
          <div><Gem /><span>Beleza nos detalhes</span></div>
          <div><Sparkles /><span>Joias para todos os momentos</span></div>
          <div><Gift /><span>Um presente cheio de significado</span></div>
        </div>
        <section ref={catalog} className="catalog page-width" id="colecao">
          <div className="catalog-heading">
            <div><div className="eyebrow">ESCOLHIDAS PARA ENCANTAR</div><h2>Encontre o seu próximo brilho</h2></div>
            <span className="collection-note">Pequenos detalhes. Grandes sentimentos.</span>
          </div>
          <div className="catalog-controls">
            {/* Mobile: a régua de categorias vira um botão que abre o menu lateral
                (drawer) — nada de fileiras rígidas com scroll horizontal.
                Desktop (>700px): os botões abaixo continuam visíveis normalmente. */}
            <Button variant="outline" className="category-picker" onClick={() => setMenu(true)}>
              Categorias · {category}
            </Button>
            <div className="category-tabs" aria-label="Categorias">
              {['Todas as joias', ...categories].map((c) => (
                <Button key={c} variant={category === c ? 'default' : 'ghost'} className="category-tab" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</Button>
              ))}
            </div>
            <div className="sort-control"><SlidersHorizontal size={15} /><select aria-label="Ordenar joias" value={sort} onChange={(e) => setSort(e.target.value)}><option value="featured">Destaques</option><option value="name">Nome: A a Z</option></select></div>
          </div>
          {(searchOpen || favoritesOnly) && (
            <div className="search-row">
              {searchOpen && (
                <label>
                  <Search size={18} />
                  <input autoFocus placeholder="Qual joia você procura?" aria-label="Pesquisar pelo nome" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <Button variant="ghost" size="icon" aria-label="Fechar busca" onClick={() => { setSearchOpen(false); setQuery(''); }}><X /></Button>
                </label>
              )}
              {favoritesOnly && <Button variant="outline" onClick={() => setFavoritesOnly(false)}>Favoritas <X /></Button>}
            </div>
          )}
          <div className="catalog-count">{products === null ? 'Carregando…' : `${visible.length} joias${favoritesOnly ? ' favoritas' : ' na seleção'}`}</div>
          {products === null && <div className="empty-state"><Loader2 className="animate-spin" /><h3>Carregando coleção…</h3></div>}
          {loadError && <div className="empty-state"><h3>Opa!</h3><p>Não foi possível carregar o catálogo agora ({loadError}). Tente novamente em instantes.</p></div>}
          <div className="product-grid">
            {products && visible.map((product) => (
              /* Card do catálogo — refeito para legibilidade (desktop e mobile):
                 - foto em proporção 4:5 com object-fit:contain → a joia inteira aparece,
                   nada é cortado pelo crop (causa nº 1 de "não dá pra ver a imagem");
                 - nome com até 2 linhas + descrição com 1 linha (antes não havia
                   descrição nenhuma no card);
                 - preço destacado ao lado do nome (fonte maior, antes era miúda);
                 - ações viram UM botão por card ("Ver joia") em largura total — os
                   dois links de texto sublinhado ("Conhecer a joia"/"Comprar") eram
                   ilegíveis e disputavam espaço. */
              <article className="product" key={product.id}>
                <a className="product-photo" href={`#${product.id}`} onClick={(e) => { e.preventDefault(); setSelected(product); }} aria-label={`Ver ${product.name}`}>
                  {product.imageUrl
                    ? <img src={product.imageUrl} alt={product.name} width={512} height={512} loading="lazy" />
                    : <span className="product-photo-empty"><Gem size={40} /></span>}
                  {product.tag && <span className="product-tag">{product.tag}</span>}
                  {!product.available && <span className="product-tag product-tag-unavailable">Indisponível</span>}
                </a>
                <div className="product-info">
                  <span className="product-category">{product.category} · Joia folheada</span>
                  <h3 className="product-name">{product.name}</h3>
                  {product.description && <p className="product-desc">{product.description}</p>}
                  <div className="product-meta">
                    {product.price != null && <span className="product-price">{formatPrice(product.price)}</span>}
                    {!product.available && <span className="product-unavailable">Esgotado</span>}
                  </div>
                  <Button variant="outline" className="product-cta" onClick={() => setSelected(product)}>Ver joia <ArrowRight size={14} /></Button>
                </div>
                <Button className="product-heart" size="icon" variant="ghost" aria-label={`${favorites.includes(product.id) ? 'Remover' : 'Adicionar'} ${product.name} das favoritas`} onClick={() => toggleFavorite(product.id)}>
                  <Heart size={18} fill={favorites.includes(product.id) ? 'currentColor' : 'none'} />
                </Button>
              </article>
            ))}
          </div>
          {products && visible.length === 0 && !loadError && (
            <div className="empty-state"><Gem /><h3>Nenhuma joia por aqui ainda</h3><p>{favoritesOnly ? 'Suas joias favoritas vão aparecer aqui.' : 'Experimente outro nome ou categoria.'}</p>
              <Button variant="outline" onClick={() => { setQuery(''); setCategory('Todas as joias'); setFavoritesOnly(false); }}>Ver todas as joias</Button></div>
          )}
          <div className="catalog-bottom"><span>Uma joia para cada versão de você.</span><Gem size={18} /><span>Escolha a que conta sua história.</span></div>
        </section>
        <section className="closing-band">
          <div className="page-width closing-inner">
            <div className="closing-flower"><img src={logo} alt="" width={500} height={500} loading="lazy" /></div>
            <div><div className="eyebrow">MAIS DO QUE UM ACESSÓRIO</div><h2>O que faz você brilhar?</h2><p>Uma lembrança, um novo começo ou simplesmente ser você.</p></div>
            {/* Mobile: CTA final em largura total, alvo de toque 48px (regra .closing-inner button no landing.css) */}
            <Button className="closing-cta" variant="outline" onClick={() => setContact(true)}>Fale com a gente <ArrowRight /></Button>
          </div>
        </section>
      </main>
      {/* Rodapé com acesso discreto ao sistema interno */}
      <footer className="page-width site-footer">
        <div><strong>FLOR DA PELE</strong><span>Joias folheadas · Beleza que floresce em você.</span></div>
        <span>© {new Date().getFullYear()} Flor da Pele · <Link to="/login" style={{ color: 'inherit', fontSize: '0.85em', opacity: 0.7 }}>Acesso interno</Link></span>
      </footer>
      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent onClose={() => setSelected(null)} className="product-dialog">
          {selected && (<>
            {selected.imageUrl && <img src={selected.imageUrl} alt={selected.name} width={512} height={512} />}
            <div className="eyebrow">{selected.category} · JOIA FOLHEADA</div>
            <DialogTitle>{selected.name}</DialogTitle>
            {selected.price != null && <p className="font-semibold text-primary">{formatPrice(selected.price)}</p>}
            <DialogDescription>{selected.description}</DialogDescription>
            {selected.available && selected.buyLink ? (
              <>
                <Button asChild className="product-buy"><a href={selected.buyLink} target="_blank" rel="noreferrer"><ShoppingBag /> Comprar esta joia</a></Button>
                <p className="availability-note">Você será levada ao endereço de compra da Flor da Pele.</p>
              </>
            ) : (
              <>
                <p className="availability-note">{selected.available ? 'Consulte os modelos e valores disponíveis com a Flor da Pele.' : 'Peça indisponível no momento. Fale com a gente para saber quando volta.'}</p>
                <Button onClick={() => { setSelected(null); setContact(true); }}><MessageCircle /> Consultar disponibilidade</Button>
              </>
            )}
          </>)}
        </DialogContent>
      </Dialog>
      {/* Menu lateral (drawer) — só mobile. As categorias viram linhas empilhadas
          em largura total (legíveis, alvo de toque 48px), com a categoria ativa
          destacada. Substitui a régua horizontal de botões no celular. */}
      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent onClose={() => setMenu(false)} className="mobile-menu drawer">
          <DialogTitle>Menu</DialogTitle>
          <DialogDescription>Veja as joias por categoria ou fale com a gente.</DialogDescription>
          <nav aria-label="Menu do catálogo">
            {/* Buscar e Favoritos moravam na barra superior; no celular a barra
                ficou limpa (logo + ☰) e elas vivem aqui, como linhas do drawer. */}
            <Button variant="ghost" className="drawer-search" onClick={() => { setMenu(false); setSearchOpen(true); requestAnimationFrame(scrollToCatalog); }}><Search /> Buscar joias</Button>
            <Button variant="ghost" className={favoritesOnly ? 'is-active' : ''} onClick={() => { setMenu(false); setFavoritesOnly(!favoritesOnly); requestAnimationFrame(scrollToCatalog); }}><Heart fill={favoritesOnly ? 'currentColor' : 'none'} /> Favoritas{favorites.length > 0 ? ` (${favorites.length})` : ''}</Button>
            <Button variant="ghost" className={category === 'Todas as joias' && !favoritesOnly ? 'is-active' : ''} onClick={() => { setMenu(false); setCategory('Todas as joias'); setFavoritesOnly(false); requestAnimationFrame(scrollToCatalog); }}>Nossa coleção</Button>
            {categories.map((c) => (
              <Button key={c} variant="ghost" className={category === c && !favoritesOnly ? 'is-active' : ''} onClick={() => { setMenu(false); setCategory(c); setFavoritesOnly(false); requestAnimationFrame(scrollToCatalog); }}>{c}</Button>
            ))}
            <Button variant="outline" onClick={() => { setMenu(false); setContact(true); }}><MessageCircle /> Fale com a gente</Button>
          </nav>
        </DialogContent>
      </Dialog>
      <Dialog open={contact} onOpenChange={setContact}>
        <DialogContent onClose={() => setContact(false)}>
          <MessageCircle className="text-primary" size={28} />
          <DialogTitle>Vamos encontrar o seu brilho</DialogTitle>
          <DialogDescription>Entre em contato pelo perfil da Flor da Pele na rede social onde você nos encontrou para consultar modelos, valores e disponibilidade.</DialogDescription>
          <p className="availability-note">O contato direto será disponibilizado em breve.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
