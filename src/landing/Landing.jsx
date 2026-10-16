// Landing page + catálogo público "Flor da Pele"
// Portada do backup Work/ (TanStack Router) para o roteador atual (react-router-dom),
// sem Tailwind/Radix: primitivos locais em ./ui.jsx e CSS escopado em ./landing.css.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Heart, Search, Sparkles, Gift, Gem, X, SlidersHorizontal,
  MessageCircle, ShoppingBag, Menu, Loader2,
} from 'lucide-react';
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription } from './ui';
import logo from './assets/flor-da-pele-logo.png';
import editorial from './assets/jewelry-editorial.jpg';
import { listProducts, categories as baseCategories, formatPrice } from './catalog';
import './landing.css';
import './landing.override.css';

const categories = [...new Set([...baseCategories, 'Brincos', 'Colares', 'Pulseiras'])];

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
  const catalog = useRef(null);

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
        <nav className="desktop-nav" aria-label="Navegação principal">
          <Button variant="link" onClick={() => { setCategory('Todas as joias'); setFavoritesOnly(false); scrollToCatalog(); }}>Nossa coleção</Button>
          {categories.map((c) => (
            <Button key={c} variant="ghost" onClick={() => { setCategory(c); scrollToCatalog(); }}>{c}</Button>
          ))}
        </nav>
        <div className="header-actions">
          <Button variant="ghost" size="icon" aria-label="Buscar joias" title="Buscar joias" onClick={() => { setSearchOpen(!searchOpen); scrollToCatalog(); }}><Search /></Button>
          <Button variant="ghost" size="icon" aria-label="Ver favoritas" title="Ver favoritas" className="favorite-counter" onClick={() => { setFavoritesOnly(!favoritesOnly); scrollToCatalog(); }}>
            <Heart fill={favoritesOnly ? 'currentColor' : 'none'} />{favorites.length > 0 && <span>{favorites.length}</span>}
          </Button>
          <Button variant="ghost" size="icon" className="nav-toggle" aria-label="Abrir menu" onClick={() => setMenu(true)}><Menu /></Button>
          <Button variant="outline" className="contact-header" onClick={() => setContact(true)}><MessageCircle /> Fale com a gente</Button>
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
              <Button className="hero-cta" onClick={scrollToCatalog}>Encontre sua joia <ArrowRight /></Button>
              <div className="hero-caption"><span /> Delicadeza em cada detalhe</div>
            </div>
          </div>
          <div className="collection-stamp">UM BRILHO<br /><em>naturalmente seu</em></div>
        </section>
        <div className="values-strip">
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
            <div className="category-tabs" aria-label="Categorias">
              {['Todas as joias', ...categories].map((c) => (
                <Button key={c} variant={category === c ? 'default' : 'ghost'} className="category-tab" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</Button>
              ))}
            </div>
            <div className="sort-control"><SlidersHorizontal size={15} /><select aria-label="Ordenar joias" value={sort} onChange={(e) => setSort(e.target.value)}><option value="featured">Destaqu</select></div>
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
              <article className="product" key={product.id}>
                <div className="product-photo">
                  <a href={`#${product.id}`} onClick={(e) => { e.preventDefault(); setSelected(product); }} aria-label={`Ver ${product.name}`}>
                    {product.imageUrl
                      ? <img src={product.imageUrl} alt={product.name} width={512} height={512} loading="lazy" />
                      : <span className="flex h-full w-full items-center justify-center"><Gem size={40} className="text-muted-foreground" /></span>}
                  </a>
                  {product.tag && <span className="product-tag">{product.tag}</span>}
                  {!product.available && <span className="product-tag">Indisponível</span>}
                  <Button className="product-heart" size="icon" variant="ghost" aria-label={`${favorites.includes(product.id) ? 'Remover' : 'Adicionar'} ${product.name} das favoritas`} onClick={() => toggleFavorite(product.id)}>
                    <Heart size={18} fill={favorites.includes(product.id) ? 'currentColor' : 'none'} />
                  </Button>
                </div>
                <div className="product-info">
                  <span>{product.category} · Joia folheada</span>
                  <h3>{product.name}</h3>
                  {product.price != null && <span className="font-semibold text-primary">{formatPrice(product.price)}</span>}
                  <Button variant="link" onClick={() => setSelected(product)}>Conhecer a joia <ArrowRight size={14} /></Button>
                  {product.available && product.buyLink && (
                    <Button variant="link" asChild className="product-buy-link"><a href={product.buyLink} target="_blank" rel="noreferrer">Comprar <ShoppingBag size={14} /></a></Button>
                  )}
                </div>
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
            <Button variant="outline" onClick={() => setContact(true)}>Vamos encontrar sua joia <ArrowRight /></Button>
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
                <p className="availability-note">{selected.available ? 'Consulte os modelos e valores disponíveis com a Flor da Pele.' : 'Peça indisponível no momento. Fale com a gente para sa[...']}</p>
                <Button onClick={() => { setSelected(null); setContact(true); }}><MessageCircle /> Consultar disponibilidade</Button>
              </>
            )}
          </>)}
        </DialogContent>
      </Dialog>
      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent onClose={() => setMenu(false)} className="mobile-menu">
          <DialogTitle>Menu</DialogTitle>
          <DialogDescription>Veja as joias por categoria ou fale com a gente.</DialogDescription>
          <nav aria-label="Menu do catálogo">
            <Button variant="ghost" onClick={() => { setMenu(false); setCategory('Todas as joias'); setFavoritesOnly(false); requestAnimationFrame(scrollToCatalog); }}>Nossa coleção</Button>
            {categories.map((c) => (
              <Button key={c} variant="ghost" onClick={() => { setMenu(false); setCategory(c); setFavoritesOnly(false); requestAnimationFrame(scrollToCatalog); }}>{c}</Button>
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
