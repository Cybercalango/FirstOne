import { createServerFn } from '@tanstack/react-start';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database } from '@/integrations/supabase/types';
import { parseBuyLink } from '@/lib/catalog';

export const PRODUCT_IMAGES_BUCKET = 'product-images';

export type ProductDTO = {
  id: string;
  name: string;
  category: string;
  description: string;
  tag: string;
  price: number | null;
  buyLink: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  sortOrder: number;
  available: boolean;
  published: boolean;
};

export type ProductInput = {
  id?: string | undefined;
  name: string;
  category: string;
  description: string;
  tag: string;
  price: number | null;
  buyLink: string | null;
  imagePath: string | null;
  sortOrder: number;
  available: boolean;
  published: boolean;
};

type ProductRow = Database['public']['Tables']['products']['Row'];

function createPublicClient() {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  return createClient<Database>(process.env['SUPABASE_URL']!, key, {
    auth: { persistSession: false },
    // Opaque sb_ keys aren't JWTs; send only apikey, not the default Authorization bearer.
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
        headers.set('apikey', key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function withImageUrls(client: SupabaseClient<Database>, rows: ProductRow[]): Promise<ProductDTO[]> {
  const paths = rows.map(row => row.image_path).filter((path): path is string => Boolean(path));
  const { data: signed } = paths.length
    ? await client.storage.from(PRODUCT_IMAGES_BUCKET).createSignedUrls(paths, 3600)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map(entry => [entry.path, entry.signedUrl]));
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    tag: row.tag,
    price: row.price,
    buyLink: row.buy_link,
    imagePath: row.image_path,
    imageUrl: row.image_path ? urlByPath.get(row.image_path) ?? null : null,
    sortOrder: row.sort_order,
    available: row.available,
    published: row.published,
  }));
}

async function requireAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
  if (!isAdmin) throw new Error('Apenas administradores podem editar o catálogo.');
}

export const listProducts = createServerFn({ method: 'GET' }).handler(async (): Promise<ProductDTO[]> => {
  const client = createPublicClient();
  const { data, error } = await client.from('products').select('*').eq('published', true).order('sort_order');
  if (error) throw new Error('Não foi possível carregar as joias.');
  return withImageUrls(client, data ?? []);
});

export const listAllProducts = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProductDTO[]> => {
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from('products').select('*').order('sort_order');
    if (error) throw new Error(error.message);
    return withImageUrls(context.supabase, data ?? []);
  });

export const saveProduct = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ProductInput) => input)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { link: buyLink, error: linkError } = parseBuyLink(data.buyLink);
    if (linkError) throw new Error(linkError);
    const row = {
      name: data.name,
      category: data.category,
      description: data.description,
      tag: data.tag,
      price: data.price,
      buy_link: buyLink,
      image_path: data.imagePath,
      sort_order: data.sortOrder,
      available: data.available,
      published: data.published,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await context.supabase.from('products').update(row).eq('id', data.id)
      : await context.supabase.from('products').insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from('products').delete().eq('id', data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
