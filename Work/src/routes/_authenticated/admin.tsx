import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useRef, useState } from 'react';
import { ArrowLeft, Gem, Loader2, LogOut, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { deleteProduct, listAllProducts, saveProduct, PRODUCT_IMAGES_BUCKET, type ProductDTO } from '@/lib/products.functions';
import { categories, formatPrice, parseBuyLink } from '@/lib/catalog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const adminProductsQueryOptions = queryOptions({
  queryKey: ['admin-products'],
  queryFn: () => listAllProducts(),
});

export const Route = createFileRoute('/_authenticated/admin')({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminProductsQueryOptions),
  head: () => ({
    meta: [
      { title: 'Editar catálogo | Flor da Pele' },
      { name: 'description', content: 'Gerencie as joias do catálogo Flor da Pele.' },
    ],
  }),
  component: AdminPage,
});

type FormState = {
  id?: string;
  name: string;
  category: string;
  description: string;
  tag: string;
  price: string;
  buyLink: string;
  sortOrder: string;
  available: boolean;
  published: boolean;
  imagePath: string | null;
  imageUrl: string | null;
};

const emptyForm: FormState = {
  name: '',
  category: categories[0],
  description: '',
  tag: '',
  price: '',
  buyLink: '',
  sortOrder: '0',
  available: true,
  published: true,
  imagePath: null,
  imageUrl: null,
};

function toForm(product: ProductDTO): FormState {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    tag: product.tag,
    price: product.price != null ? String(product.price).replace('.', ',') : '',
    buyLink: product.buyLink ?? '',
    sortOrder: String(product.sortOrder),
    available: product.available,
    published: product.published,
    imagePath: product.imagePath,
    imageUrl: product.imageUrl,
  };
}

function AdminPage() {
  const { data: products } = useSuspenseQuery(adminProductsQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const save = useServerFn(saveProduct);
  const remove = useServerFn(deleteProduct);
  const [form, setForm] = useState<FormState | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ProductDTO | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    await queryClient.invalidateQueries({ queryKey: ['products'] });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      let imagePath = form.imagePath;
      if (photo) {
        const extension = photo.name.split('.').pop() ?? 'jpg';
        imagePath = `${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(imagePath, photo, { upsert: true });
        if (error) throw error;
      }
      const price = form.price.trim() ? Number(form.price.trim().replace(',', '.')) : null;
      if (price != null && Number.isNaN(price)) throw new Error('Preço inválido. Use números, por exemplo 89,90.');
      const { link: buyLink, error: linkError } = parseBuyLink(form.buyLink);
      if (linkError) throw new Error(linkError);
      await save({
        data: {
          id: form.id,
          name: form.name.trim(),
          category: form.category,
          description: form.description.trim(),
          tag: form.tag.trim(),
          price,
          buyLink,
          imagePath,
          sortOrder: Number(form.sortOrder) || 0,
          available: form.available,
          published: form.published,
        },
      });
      toast.success(form.id ? 'Joia atualizada.' : 'Joia adicionada ao catálogo.');
      setForm(null);
      setPhoto(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!removing) return;
    setBusy(true);
    try {
      await remove({ data: { id: removing.id } });
      toast.success(`"${removing.name}" removida do catálogo.`);
      setRemoving(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: '/auth', search: { redirect: undefined }, replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 py-4">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
            <Gem className="shrink-0 text-primary" size={22} />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-foreground">Catálogo Flor da Pele</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">Adicione, edite e organize suas joias.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" asChild><Link to="/"><ArrowLeft /> Ver o site</Link></Button>
            <Button variant="outline" onClick={handleSignOut}><LogOut /> Sair</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{products.length} joias cadastradas</span>
          <Button onClick={() => { setPhoto(null); setForm({ ...emptyForm, sortOrder: String(products.length + 1) }); }}>
            <Plus /> Nova joia
          </Button>
        </div>
        <div className="space-y-2 sm:hidden">
          {products.map(product => (
            <div key={product.id} className="flex items-center gap-3 rounded-md border border-border p-3">
              {product.imageUrl
                ? <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted"><Gem size={18} className="text-muted-foreground" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {product.category} · {product.price != null ? formatPrice(product.price) : 'sem preço'} · {product.published ? (product.available ? 'no site' : 'indisponível') : 'oculta'}
                </p>
                {product.buyLink && (
                  <a href={product.buyLink} target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-4">link de compra</a>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" aria-label={`Editar ${product.name}`} onClick={() => { setPhoto(null); setForm(toForm(product)); }}>
                  <Pencil size={16} />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Remover ${product.name}`} onClick={() => setRemoving(product)}>
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead>Joia</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Compra</TableHead>
                <TableHead>Ordem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map(product => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {product.imageUrl
                        ? <img src={product.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                        : <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted"><Gem size={16} className="text-muted-foreground" /></span>}
                      <span className="font-medium text-foreground">{product.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>{product.price != null ? formatPrice(product.price) : '—'}</TableCell>
                  <TableCell>
                    {product.buyLink
                      ? <a href={product.buyLink} target="_blank" rel="noreferrer" className="text-sm text-primary underline underline-offset-4">Abrir link</a>
                      : <span className="text-sm text-muted-foreground">sem link</span>}
                  </TableCell>
                  <TableCell>{product.sortOrder}</TableCell>
                  <TableCell>
                    <span className="text-xs">
                      {product.published ? (product.available ? 'No site' : 'No site · indisponível') : 'Oculta'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" aria-label={`Editar ${product.name}`} onClick={() => { setPhoto(null); setForm(toForm(product)); }}>
                      <Pencil size={16} />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Remover ${product.name}`} onClick={() => setRemoving(product)}>
                      <Trash2 size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>

      <Dialog open={form !== null} onOpenChange={open => { if (!open) { setForm(null); setPhoto(null); } }}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100%-24px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          {form && (
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-border bg-background px-6 py-4 pr-14">
                <DialogTitle>{form.id ? 'Editar joia' : 'Nova joia'}</DialogTitle>
                <DialogDescription>Preencha as informações que aparecem no catálogo.</DialogDescription>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pt-5 pb-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Nome</Label>
                <Input id="p-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={form.category} onValueChange={value => setForm({ ...form, category: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-price">Preço (opcional)</Label>
                  <Input id="p-price" inputMode="decimal" placeholder="89,90" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-buylink">Link de compra (opcional)</Label>
                <Input id="p-buylink" type="text" inputMode="url" autoComplete="url" spellCheck={false} placeholder="https://wa.me/5584999999999" value={form.buyLink} onChange={e => setForm({ ...form, buyLink: e.target.value })} />
                <p className="text-xs text-muted-foreground">Endereço da página, loja ou conversa onde a joia pode ser comprada. Deixe vazio para mostrar só o botão de contato.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-description">Descrição</Label>
                <Textarea id="p-description" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-tag">Etiqueta (opcional)</Label>
                  <Input id="p-tag" placeholder="Destaque" value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-order">Ordem no catálogo</Label>
                  <Input id="p-order" inputMode="numeric" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Foto</Label>
                <div className="flex items-center gap-3">
                  {(photo || form.imageUrl) && (
                    <img src={photo ? URL.createObjectURL(photo) : form.imageUrl!} alt="" className="h-16 w-16 rounded-md object-cover" />
                  )}
                  <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
                  <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                    {photo ? photo.name : form.imageUrl ? 'Trocar foto' : 'Escolher foto'}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <Label htmlFor="p-published">Aparece no site</Label>
                <Switch id="p-published" checked={form.published} onCheckedChange={checked => setForm({ ...form, published: checked })} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <Label htmlFor="p-available">Disponível para venda</Label>
                <Switch id="p-available" checked={form.available} onCheckedChange={checked => setForm({ ...form, available: checked })} />
              </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-border bg-background px-6 py-4">
                <Button type="button" variant="outline" onClick={() => { setForm(null); setPhoto(null); }}>Cancelar</Button>
                <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Salvar</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing !== null} onOpenChange={open => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{removing?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>A joia sai do catálogo definitivamente. Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
