alter table public.products add column buy_link text;

alter table public.products add constraint products_buy_link_is_url check (buy_link is null or buy_link ~ '^https?://[^[:space:]]+$');

comment on column public.products.buy_link is 'URL da página ou perfil onde a joia pode ser comprada';