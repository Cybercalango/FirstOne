// Camada de dados do catálogo público (landing page)
// Fonte: tabela `items` do projeto principal + imagens do bucket publico 'catalogo'.
import { supabase } from '../supabaseClient';

export const categories = ['Anéis', 'Brincos', 'Pulseiras', 'Colares', 'Conjuntos'];

export function formatPrice(price) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price ?? 0);
}

// Categorias livres aceitas na publicação (inclui as originais do backup)
const EXTRA_CATEGORIES = ['Brincos', 'Colares', 'Pulseiras'];

export function allCategories() {
  const set = new Set([...categories, ...EXTRA_CATEGORIES]);
  return [...set];
}

/**
 * Lista peças publicadas no catálogo.
 * Retorna objetos no formato ProductDTO usado pela landing.
 */
export async function listProducts() {
  const { data, error } = await supabase
    .from('items')
    // `code` e `price` são colunas antigas do catálogo portado da landing
    // original; o gerenciador grava em `barcode` e `price_sale`.
    // Selecionamos tudo (*) para não quebrar se alguma coluna faltar.
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category || 'Joias',
    description: row.description || '',
    tag: row.available === false ? '' : 'Novo',
    price: row.price_sale != null ? Number(row.price_sale)
         : row.price != null ? Number(row.price) : null,
    buyLink: null,
    imagePath: null,
    imageUrl: row.image_url || null,
    sortOrder: row.sort_order ?? 0,
    available: row.available !== false,
    published: row.published !== false,
  }));
}

/** Salva/atualiza uma peça publicada no catálogo (uso do admin interno). */
export async function saveProduct(product) {
  const payload = {
    name: product.name,
    category: product.category,
    description: product.description ?? '',
    price: product.price,
    image_url: product.imageUrl,
    available: product.available,
    published: product.published,
    sort_order: product.sortOrder ?? 0,
  };
  if (product.id && typeof product.id === 'number') {
    const { data, error } = await supabase.from('items').update(payload).eq('id', product.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('items')
    .insert({ ...payload, status: 'estoque', acquisition_date: new Date().toISOString().slice(0, 10) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}
