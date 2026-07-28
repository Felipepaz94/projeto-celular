-- ============================================================
-- SISTEMA DE ESTOQUE E PDV - SUPABASE (ARQUIVO ÚNICO)
-- Compatível com banco novo e com atualização de banco existente.
-- Execute integralmente no SQL Editor do Supabase.
-- Não apaga registros existentes.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABELAS PRINCIPAIS
-- ------------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  contato text,
  email text,
  documento text,
  observacoes text,
  cliente boolean not null default true,
  fornecedor boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.fabricantes (
  nome text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.bandeiras_cartao (
  nome text primary key
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nome text not null,
  cliente_contato text,
  total numeric(14,2) not null default 0 check (total >= 0),
  status text not null default 'ativo',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  fabricante text,
  modelo text,
  memoria text,
  cor text,
  bateria smallint,
  caixa boolean,
  identifier text,
  fornecedor text references public.suppliers(name) on update cascade,
  nome text,
  quantidade integer,
  custo numeric(14,2) not null default 0,
  custo_base numeric(14,2) not null default 0,
  reparos jsonb not null default '[]'::jsonb,
  venda numeric(14,2) not null default 0,
  categoria text not null default 'Troca — a completar',
  descricao text,
  incompleto boolean not null default false,
  status_aprovacao text not null default 'aprovado',
  venda_origem_id uuid references public.sales(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.product_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_key text not null,
  public_url text,
  file_name text,
  content_type text,
  size_bytes integer,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique(product_id, position)
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  nome text not null,
  sub text,
  kind text not null,
  tipo text not null default 'produto',
  quantidade integer not null default 1,
  venda_unit numeric(14,2) not null default 0,
  status text not null default 'ativo',
  product_snapshot jsonb,
  estornado_em timestamptz,
  motivo_estorno text,
  trocado_em timestamptz,
  troca_do_item_id uuid references public.sale_items(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  forma text not null,
  valor_base numeric(14,2) not null default 0,
  taxa_pct numeric(7,4) not null default 0,
  valor_taxa numeric(14,2) not null default 0,
  valor numeric(14,2) not null default 0,
  bandeira text references public.bandeiras_cartao(nome) on update cascade,
  parcelas smallint,
  created_at timestamptz not null default now()
);

create table if not exists public.protecao_planos (
  id uuid primary key default gen_random_uuid(),
  modelo text not null unique,
  valor numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.taxas_cartao (
  bandeira text not null references public.bandeiras_cartao(nome) on update cascade on delete cascade,
  parcelas smallint not null,
  taxa_pct numeric(7,4) not null default 0,
  created_at timestamptz not null default now(),
  primary key (bandeira, parcelas)
);

create table if not exists public.configuracoes_empresa (
  id smallint primary key default 1,
  nome_fantasia text,
  razao_social text,
  documento text,
  telefone text,
  email text,
  endereco text,
  logo_data text,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  slug text unique,
  role text not null default 'vendedor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ATUALIZAÇÃO DE ESTRUTURAS ANTIGAS
-- ------------------------------------------------------------

alter table public.products add column if not exists custo_base numeric(14,2) not null default 0;
alter table public.products add column if not exists reparos jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists descricao text;
alter table public.products add column if not exists status_aprovacao text not null default 'aprovado';
alter table public.products add column if not exists venda_origem_id uuid references public.sales(id) on delete set null;
alter table public.configuracoes_empresa add column if not exists logo_data text;
alter table public.user_profiles add column if not exists slug text;
alter table public.sale_items add column if not exists created_at timestamptz not null default now();
alter table public.sale_payments add column if not exists created_at timestamptz not null default now();
alter table public.taxas_cartao add column if not exists created_at timestamptz not null default now();

update public.products
set custo_base = custo
where custo_base = 0 and custo > 0 and (reparos is null or reparos = '[]'::jsonb);
update public.products set reparos = '[]'::jsonb where reparos is null;

-- Colunas comuns de ativação e auditoria.
do $sql$
declare tabela text;
begin
  foreach tabela in array array[
    'products','suppliers','product_photos','clientes','fabricantes','sales',
    'sale_items','sale_payments','protecao_planos','bandeiras_cartao',
    'taxas_cartao','configuracoes_empresa'
  ] loop
    execute format('alter table public.%I add column if not exists ativo boolean not null default true', tabela);
    execute format('alter table public.%I add column if not exists inativado_em timestamptz', tabela);
    execute format('alter table public.%I add column if not exists criado_por uuid references auth.users(id)', tabela);
    execute format('alter table public.%I add column if not exists atualizado_por uuid references auth.users(id)', tabela);
  end loop;
end $sql$;

-- ------------------------------------------------------------
-- REGRAS DE INTEGRIDADE
-- ------------------------------------------------------------

alter table public.products drop constraint if exists products_kind_check;
alter table public.products add constraint products_kind_check
  check (kind in ('celular','ipad','mac','jbl','acessorio','outro')) not valid;

alter table public.products drop constraint if exists products_bateria_check;
alter table public.products add constraint products_bateria_check
  check (bateria is null or bateria between 1 and 100) not valid;

alter table public.products drop constraint if exists products_celular_imei_check;
alter table public.products add constraint products_celular_imei_check
  check (kind <> 'celular' or incompleto or identifier ~ '^[0-9]{15}$') not valid;

alter table public.products drop constraint if exists products_status_aprovacao_check;
alter table public.products add constraint products_status_aprovacao_check
  check (status_aprovacao in ('aguardando','aprovado','reprovado')) not valid;

alter table public.sales drop constraint if exists sales_status_check;
alter table public.sales add constraint sales_status_check
  check (status in ('ativo','parcialmente_estornada','estornada')) not valid;

alter table public.sale_items drop constraint if exists sale_items_tipo_check;
alter table public.sale_items add constraint sale_items_tipo_check
  check (tipo in ('produto','protecao','avulso')) not valid;

alter table public.sale_items drop constraint if exists sale_items_status_check;
alter table public.sale_items add constraint sale_items_status_check
  check (status in ('ativo','estornado','trocado')) not valid;

alter table public.sale_payments drop constraint if exists sale_payments_forma_check;
alter table public.sale_payments add constraint sale_payments_forma_check
  check (forma in ('pix','cartao_credito','cartao_debito','dinheiro','troca','outro')) not valid;

alter table public.user_profiles drop constraint if exists user_profiles_role_check;
alter table public.user_profiles add constraint user_profiles_role_check
  check (role in ('admin','vendedor')) not valid;

alter table public.configuracoes_empresa drop constraint if exists configuracoes_empresa_id_check;
alter table public.configuracoes_empresa add constraint configuracoes_empresa_id_check check (id = 1) not valid;

-- ------------------------------------------------------------
-- ÍNDICES
-- ------------------------------------------------------------

create index if not exists idx_products_kind on public.products(kind);
create index if not exists idx_products_categoria on public.products(categoria);
create index if not exists idx_products_status_aprovacao on public.products(status_aprovacao);
create index if not exists idx_products_venda_origem on public.products(venda_origem_id);
create index if not exists idx_products_created_at on public.products(created_at desc);
create index if not exists idx_sales_created_at on public.sales(created_at desc);
create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);
create index if not exists idx_sale_items_product_id on public.sale_items(product_id);
create index if not exists idx_sale_payments_sale_id on public.sale_payments(sale_id);
create index if not exists idx_product_photos_product_id on public.product_photos(product_id);
create index if not exists idx_clientes_nome on public.clientes(lower(nome));

drop index if exists public.uq_products_identifier;
drop index if exists public.uq_products_imei_digits;
create unique index uq_products_identifier
  on public.products(identifier)
  where identifier is not null and ativo = true;
create unique index uq_products_imei_digits
  on public.products ((regexp_replace(identifier, '[^0-9]', '', 'g')))
  where kind = 'celular' and identifier is not null and ativo = true
    and regexp_replace(identifier, '[^0-9]', '', 'g') <> '';

create unique index if not exists uq_clientes_documento_digits
  on public.clientes ((regexp_replace(documento, '[^0-9]', '', 'g')))
  where documento is not null and regexp_replace(documento, '[^0-9]', '', 'g') <> '';

create unique index if not exists uq_user_profiles_slug on public.user_profiles(slug);

-- ------------------------------------------------------------
-- FUNÇÕES E TRIGGERS
-- ------------------------------------------------------------

create or replace function public.fn_user_profile_slug() returns trigger
language plpgsql set search_path = public
as $fn$
declare base_slug text;
begin
  if new.slug is null or trim(new.slug) = '' then
    base_slug := lower(translate(
      coalesce(nullif(trim(new.full_name),''), split_part(new.email,'@',1), 'usuario'),
      'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'
    ));
    base_slug := trim(both '-' from regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g'));
    new.slug := coalesce(nullif(base_slug,''), 'usuario') || '-' || left(replace(new.id::text, '-', ''), 8);
  end if;
  return new;
end $fn$;

drop trigger if exists trg_user_profile_slug on public.user_profiles;
create trigger trg_user_profile_slug before insert or update on public.user_profiles
for each row execute function public.fn_user_profile_slug();

create or replace function public.fn_is_admin() returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists(select 1 from public.user_profiles where id = auth.uid() and role = 'admin')
$fn$;

create or replace function public.fn_auditoria_usuario() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
  end if;
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por, new.criado_por);
  return new;
end $fn$;

create or replace function public.fn_create_user_profile() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare primeiro_usuario boolean;
begin
  select not exists(select 1 from public.user_profiles) into primeiro_usuario;
  insert into public.user_profiles(id,email,full_name,role)
  values (
    new.id,
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'full_name',''),
    case when primeiro_usuario then 'admin' else 'vendedor' end
  ) on conflict(id) do nothing;
  return new;
end $fn$;

drop trigger if exists trg_create_user_profile on auth.users;
create trigger trg_create_user_profile after insert on auth.users
for each row execute function public.fn_create_user_profile();

create or replace function public.fn_baixa_estoque() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.product_id is null or new.status <> 'ativo' then return new; end if;
  if new.kind = 'acessorio' then
    update public.products
       set quantidade = greatest(coalesce(quantidade,0) - new.quantidade, 0)
     where id = new.product_id;
    update public.products
       set ativo = false, inativado_em = now()
     where id = new.product_id and coalesce(quantidade,0) <= 0;
  else
    update public.products set ativo = false, inativado_em = now() where id = new.product_id;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_baixa_estoque on public.sale_items;
create trigger trg_baixa_estoque after insert on public.sale_items
for each row execute function public.fn_baixa_estoque();

create or replace function public.fn_devolve_estoque() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if old.status <> 'ativo' or new.status = old.status
     or new.status not in ('estornado','trocado') or new.product_id is null then
    return new;
  end if;
  if new.kind = 'acessorio' and exists(select 1 from public.products where id = new.product_id) then
    update public.products
       set quantidade = coalesce(quantidade,0) + new.quantidade,
           ativo = true, inativado_em = null
     where id = new.product_id;
  elsif exists(select 1 from public.products where id = new.product_id) then
    update public.products set ativo = true, inativado_em = null where id = new.product_id;
  elsif new.product_snapshot is not null then
    insert into public.products (
      id, kind, fabricante, modelo, memoria, cor, bateria, caixa, identifier,
      fornecedor, nome, quantidade, custo, custo_base, reparos, venda, categoria,
      descricao, incompleto, status_aprovacao, venda_origem_id, created_at,
      ativo, inativado_em
    ) values (
      new.product_id,
      coalesce(new.product_snapshot->>'kind', new.kind),
      new.product_snapshot->>'fabricante',
      new.product_snapshot->>'modelo',
      new.product_snapshot->>'memoria',
      new.product_snapshot->>'cor',
      nullif(new.product_snapshot->>'bateria','')::smallint,
      nullif(new.product_snapshot->>'caixa','')::boolean,
      new.product_snapshot->>'identifier',
      new.product_snapshot->>'fornecedor',
      new.product_snapshot->>'nome',
      nullif(new.product_snapshot->>'quantidade','')::integer,
      coalesce(nullif(new.product_snapshot->>'custo','')::numeric,0),
      coalesce(nullif(new.product_snapshot->>'custo_base','')::numeric, nullif(new.product_snapshot->>'custo','')::numeric,0),
      coalesce(new.product_snapshot->'reparos','[]'::jsonb),
      coalesce(nullif(new.product_snapshot->>'venda','')::numeric,0),
      coalesce(new.product_snapshot->>'categoria','Troca — a completar'),
      new.product_snapshot->>'descricao',
      coalesce(nullif(new.product_snapshot->>'incompleto','')::boolean,false),
      coalesce(new.product_snapshot->>'status_aprovacao','aprovado'),
      nullif(new.product_snapshot->>'venda_origem_id','')::uuid,
      coalesce(nullif(new.product_snapshot->>'created_at','')::timestamptz,now()),
      true,
      null
    )
    on conflict (id) do update set ativo = true, inativado_em = null;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_devolve_estoque on public.sale_items;
create trigger trg_devolve_estoque after update of status on public.sale_items
for each row execute function public.fn_devolve_estoque();

create or replace function public.fn_atualiza_status_venda() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare total_itens integer; itens_ativos integer; venda_id uuid;
begin
  if tg_op = 'DELETE' then
    venda_id := old.sale_id;
  else
    venda_id := new.sale_id;
  end if;
  select count(*) into total_itens from public.sale_items where sale_id = venda_id;
  select count(*) into itens_ativos from public.sale_items where sale_id = venda_id and status = 'ativo';
  update public.sales
     set status = case
       when total_itens = 0 or itens_ativos = 0 then 'estornada'
       when itens_ativos < total_itens then 'parcialmente_estornada'
       else 'ativo'
     end
   where id = venda_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $fn$;

drop trigger if exists trg_atualiza_status_venda on public.sale_items;
create trigger trg_atualiza_status_venda after insert or update or delete on public.sale_items
for each row execute function public.fn_atualiza_status_venda();

-- Auditoria em todas as tabelas operacionais.
do $sql$
declare tabela text;
begin
  foreach tabela in array array[
    'products','suppliers','product_photos','clientes','fabricantes','sales',
    'sale_items','sale_payments','protecao_planos','bandeiras_cartao',
    'taxas_cartao','configuracoes_empresa'
  ] loop
    execute format('drop trigger if exists trg_auditoria_usuario on public.%I', tabela);
    execute format('create trigger trg_auditoria_usuario before insert or update on public.%I for each row execute function public.fn_auditoria_usuario()', tabela);
  end loop;
end $sql$;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------

do $sql$
declare tabela text;
begin
  foreach tabela in array array[
    'products','suppliers','product_photos','clientes','fabricantes','sales',
    'sale_items','sale_payments','protecao_planos','bandeiras_cartao',
    'taxas_cartao','configuracoes_empresa'
  ] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('drop policy if exists authenticated_access on public.%I', tabela);
    execute format('drop policy if exists authenticated_read on public.%I', tabela);
    execute format('drop policy if exists authenticated_insert on public.%I', tabela);
    execute format('drop policy if exists authenticated_update on public.%I', tabela);
    execute format('drop policy if exists authenticated_delete on public.%I', tabela);
    execute format('create policy authenticated_read on public.%I for select to authenticated using (ativo = true or public.fn_is_admin())', tabela);
    execute format('create policy authenticated_insert on public.%I for insert to authenticated with check (true)', tabela);
    execute format('create policy authenticated_update on public.%I for update to authenticated using (true) with check (true)', tabela);
  end loop;
end $sql$;

-- A identidade visual precisa ser lida antes do login.
drop policy if exists public_company_branding_read on public.configuracoes_empresa;
create policy public_company_branding_read on public.configuracoes_empresa
for select to anon using (id = 1 and ativo = true);

alter table public.user_profiles enable row level security;
drop policy if exists users_read_profiles on public.user_profiles;
drop policy if exists admins_update_profiles on public.user_profiles;
create policy users_read_profiles on public.user_profiles
for select to authenticated using (id = auth.uid() or public.fn_is_admin());
create policy admins_update_profiles on public.user_profiles
for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ------------------------------------------------------------
-- DADOS ESTRUTURAIS PADRÃO DO CÓDIGO
-- ------------------------------------------------------------

-- Somente cadastros fixos já definidos no código da aplicação.
insert into public.fabricantes(nome)
values ('Apple'),('Samsung'),('Xiaomi'),('Motorola'),('Google')
on conflict (nome) do update set ativo = true, inativado_em = null;

insert into public.bandeiras_cartao(nome)
values ('Visa'),('Master'),('Elo'),('Amex'),('Crednosso')
on conflict (nome) do update set ativo = true, inativado_em = null;

-- Os níveis de acesso válidos são Admin (admin) e Vendedor (vendedor),
-- garantidos pela constraint user_profiles_role_check.
-- Nenhum produto, cliente, fornecedor, plano, taxa, venda, pagamento,
-- configuração de empresa ou usuário é inserido por este arquivo.
-- O primeiro usuário cadastrado normalmente pelo Auth do Supabase será criado
-- pelo trigger fn_create_user_profile e receberá o papel de administrador.

-- Privilégios da API do Supabase. O RLS acima continua limitando cada operação.
grant usage on schema public to anon, authenticated;
grant select on public.configuracoes_empresa to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

commit;

-- Fim do arquivo. Após executar, recarregue o projeto para atualizar o cache do PostgREST.
