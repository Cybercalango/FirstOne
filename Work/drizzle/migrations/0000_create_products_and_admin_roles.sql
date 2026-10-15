create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text not null default '',
  tag text not null default '',
  price numeric(10,2),
  image_path text,
  sort_order integer not null default 0,
  available boolean not null default true,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "Anyone reads published products" on public.products for select to anon, authenticated using (published);
create policy "Admins read all products" on public.products for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins insert products" on public.products for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update products" on public.products for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete products" on public.products for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create or replace function public.grant_first_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end
$$;
create trigger on_auth_user_created_grant_admin
  after insert on auth.users
  for each row execute function public.grant_first_admin();

create policy "Public reads product images" on storage.objects for select to anon, authenticated using (bucket_id = 'product-images');
create policy "Admins upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));

insert into public.products (name, category, description, tag, image_path, sort_order) values
  ('Argola Essência', 'Brincos', 'Curvas delicadas e um brilho que acompanha você. Uma argola clássica para compor seus momentos.', 'Essenciais', 'argolas.jpg', 1),
  ('Colar Ponto de Luz', 'Colares', 'Um ponto de luz, infinitas possibilidades. Um colar delicado para usar sozinho ou em composições.', 'Destaque', 'colar.jpg', 2),
  ('Pulseira Delicata', 'Pulseiras', 'Pequenos detalhes fazem a diferença. Uma pulseira de corrente delicada com esferas douradas.', '', 'pulseira.jpg', 3),
  ('Brinco Pérola', 'Brincos', 'O encontro do brilho dourado com a suavidade da pérola. Elegância que atravessa o tempo.', 'Clássicos', 'perolas.jpg', 4);