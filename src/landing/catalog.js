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
 *
 * Implementa fallback automático para o caso em que a coluna `code`
 * não exista na tabela (erro comum em migrações). Nesse caso, tenta
 * refazer a consulta sem a coluna `code` e prosseguir normalmente.
 */
export async function listProducts() {
  // campos usados pela landing (mantemos uma lista para fallback)
  const fieldsWithCode = 'id, code, name, description, price, image_url, category, available, published, sort_order';
  const fieldsWithoutCode = 'id, name, description, price, image_url, category, available, published, sort_order';

  async function query(fields) {
    const { data, error } = await supabase
      .from('items')
      .select(fields)
      .eq('published', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    return { data, error };
  }

  // Primeiro tenta com a coluna `code` (compatibilidade com backups antigos)
  try {
    const { data, error } = await query(fieldsWithCode);
    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category || 'Joias',
      description: row.description || '',
      tag: row.available === false ? '' : 'Novo',
      price: row.price != null ? Number(row.price) : null,
      buyLink: null,
      imagePath: null,
      imageUrl: row.image_url || null,
      sortOrder: row.sort_order ?? 0,
      available: row.available !== false,
      published: row.published !== false,
    }));
  } catch (err) {
    const msg = String(err?.message || err);
    // Detecta erro de coluna inexistente e tenta fallback sem `code`
    if (/column[^\n]*code[^\n]*does not exist/i.test(msg) || /column .*code.*does not exist/i.test(msg)) {
      // Tenta novamente sem `code`
      const { data, error } = await query(fieldsWithoutCode);
      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category || 'Joias',
        description: row.description || '',
        tag: row.available === false ? '' : 'Novo',
        price: row.price != null ? Number(row.price) : null,
        buyLink: null,
        imagePath: null,
        imageUrl: row.image_url || null,
        sortOrder: row.sort_order ?? 0,
        available: row.available !== false,
        published: row.published !== false,
      }));
    }

    // Se for outro erro, propaga para o chamador (Landing.jsx exibirá a mensagem)
    throw err;
  }
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
