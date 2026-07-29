-- ============================================================
-- REDEFINICOES SEGURAS PARA O BANCO DE PRODUCAO
-- Projeto: Loja de Celular
-- Pode ser executado mais de uma vez.
-- Nao apaga tabelas e nao exclui registros.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. FORNECEDORES: corrige a FK products.fornecedor -> suppliers.name
-- ------------------------------------------------------------

create table if not exists public.suppliers (
  name text primary key,
  created_at timestamptz not null default now()
);

alter table public.suppliers add column if not exists ativo boolean not null default true;
alter table public.suppliers add column if not exists inativado_em timestamptz;
alter table public.clientes add column if not exists fornecedor boolean not null default false;
alter table public.clientes add column if not exists ativo boolean not null default true;
alter table public.products add column if not exists fornecedor text;

insert into public.suppliers(name, ativo, inativado_em)
select distinct trim(nome), true, null::timestamptz
from public.clientes
where fornecedor and ativo and nullif(trim(nome), '') is not null
on conflict (name) do update set ativo = true, inativado_em = null;

insert into public.suppliers(name, ativo, inativado_em)
select distinct trim(fornecedor), true, null::timestamptz
from public.products
where nullif(trim(fornecedor), '') is not null
on conflict (name) do update set ativo = true, inativado_em = null;

alter table public.products drop constraint if exists products_fornecedor_fkey;
alter table public.products add constraint products_fornecedor_fkey
  foreign key (fornecedor) references public.suppliers(name)
  on update cascade not valid;

create or replace function public.fn_sincroniza_fornecedor() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.fornecedor and new.ativo then
    insert into public.suppliers(name, ativo, inativado_em)
    values (trim(new.nome), true, null::timestamptz)
    on conflict (name) do update set ativo = true, inativado_em = null;
  end if;

  if tg_op = 'UPDATE'
     and old.fornecedor
     and (not new.fornecedor or not new.ativo or old.nome is distinct from new.nome)
     and not exists (
       select 1 from public.clientes cliente
       where cliente.id <> new.id
         and cliente.fornecedor
         and cliente.ativo
         and cliente.nome = old.nome
     ) then
    update public.suppliers
       set ativo = false, inativado_em = now()
     where name = old.nome;
  end if;

  return new;
end $fn$;

drop trigger if exists trg_sincroniza_fornecedor on public.clientes;
create trigger trg_sincroniza_fornecedor
after insert or update of nome, fornecedor, ativo on public.clientes
for each row execute function public.fn_sincroniza_fornecedor();

-- ------------------------------------------------------------
-- 2. COMISSOES: percentual geral e percentual individual
-- ------------------------------------------------------------

alter table public.configuracoes_empresa
  add column if not exists percentual_comissao_padrao numeric(7,4) not null default 5;
alter table public.configuracoes_empresa add column if not exists ativo boolean not null default true;
alter table public.configuracoes_empresa add column if not exists inativado_em timestamptz;

alter table public.configuracoes_empresa
  drop constraint if exists configuracoes_empresa_percentual_comissao_padrao_check;
alter table public.configuracoes_empresa
  add constraint configuracoes_empresa_percentual_comissao_padrao_check
  check (percentual_comissao_padrao between 0 and 100) not valid;

create table if not exists public.comissoes_vendedores (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  percentual numeric(7,4) not null default 5,
  updated_at timestamptz not null default now()
);

alter table public.comissoes_vendedores alter column percentual set default 5;
alter table public.comissoes_vendedores add column if not exists ativo boolean not null default true;
alter table public.comissoes_vendedores add column if not exists inativado_em timestamptz;
alter table public.comissoes_vendedores add column if not exists criado_por uuid references auth.users(id);
alter table public.comissoes_vendedores add column if not exists atualizado_por uuid references auth.users(id);
alter table public.comissoes_vendedores drop constraint if exists comissoes_vendedores_percentual_check;
alter table public.comissoes_vendedores add constraint comissoes_vendedores_percentual_check
  check (percentual between 0 and 100) not valid;

create or replace function public.fn_is_admin() returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'admin'
  );
$fn$;

alter table public.comissoes_vendedores enable row level security;
drop policy if exists authenticated_read on public.comissoes_vendedores;
drop policy if exists authenticated_insert on public.comissoes_vendedores;
drop policy if exists authenticated_update on public.comissoes_vendedores;
drop policy if exists admins_read_commissions on public.comissoes_vendedores;
drop policy if exists admins_insert_commissions on public.comissoes_vendedores;
drop policy if exists admins_update_commissions on public.comissoes_vendedores;
create policy admins_read_commissions on public.comissoes_vendedores
  for select to authenticated using (public.fn_is_admin());
create policy admins_insert_commissions on public.comissoes_vendedores
  for insert to authenticated with check (public.fn_is_admin());
create policy admins_update_commissions on public.comissoes_vendedores
  for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

grant select, insert, update on public.comissoes_vendedores to authenticated;

-- Garante que o admin consiga ler e salvar o percentual geral.
alter table public.configuracoes_empresa enable row level security;
drop policy if exists authenticated_read on public.configuracoes_empresa;
drop policy if exists authenticated_insert on public.configuracoes_empresa;
drop policy if exists authenticated_update on public.configuracoes_empresa;
create policy authenticated_read on public.configuracoes_empresa
  for select to authenticated using (true);
create policy authenticated_insert on public.configuracoes_empresa
  for insert to authenticated with check (public.fn_is_admin());
create policy authenticated_update on public.configuracoes_empresa
  for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());
grant select, insert, update on public.configuracoes_empresa to authenticated;

-- ------------------------------------------------------------
-- 3. TOTAL FINAL: inclui juros do cartao ja gravados nos pagamentos
-- ------------------------------------------------------------

update public.sales as sale
set total = payments.total_pago
from (
  select sale_id, round(sum(valor)::numeric, 2) as total_pago
  from public.sale_payments
  group by sale_id
) as payments
where sale.id = payments.sale_id
  and abs(sale.total - payments.total_pago) > 0.009;

commit;

-- Conferencia: deve retornar uma linha com os totais existentes.
select
  (select count(*) from public.suppliers) as fornecedores,
  (select count(*) from public.comissoes_vendedores) as percentuais_individuais,
  (select percentual_comissao_padrao from public.configuracoes_empresa where id = 1) as percentual_geral;
