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
  trading boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.fabricantes (
  nome text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.product_types (
  key text primary key,
  label text not null,
  icon text not null default 'ti-box',
  sub text not null default 'Serial · sem qtd',
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
  estornado_por uuid references auth.users(id) on delete set null,
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
  trading text,
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
  custo_unit_snapshot numeric(14,2) not null default 0,
  reparos_snapshot numeric(14,2) not null default 0,
  custo_total_snapshot numeric(14,2) not null default 0,
  status text not null default 'ativo',
  product_snapshot jsonb,
  estornado_em timestamptz,
  motivo_estorno text,
  estornado_por uuid references auth.users(id) on delete set null,
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
  status text not null default 'ativo',
  estornado_em timestamptz,
  motivo_estorno text,
  estornado_por uuid references auth.users(id) on delete set null,
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
  slogan text,
  razao_social text,
  documento text,
  telefone text,
  email text,
  endereco text,
  logo_data text,
  percentual_comissao_padrao numeric(7,4) not null default 5 check (percentual_comissao_padrao between 0 and 100),
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

create table if not exists public.comissoes_vendedores (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  percentual numeric(7,4) not null default 5 check (percentual between 0 and 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null check (movement_type in ('entrada','despesa')),
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  movement_date date not null default current_date,
  seller_id uuid references public.user_profiles(id) on delete set null,
  seller_name text,
  notes text,
  status text not null default 'ativo' check (status in ('ativo','cancelado')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ATUALIZAÇÃO DE ESTRUTURAS ANTIGAS
-- ------------------------------------------------------------

alter table public.clientes add column if not exists trading boolean not null default false;
alter table public.clientes add column if not exists fornecedor boolean not null default false;
alter table public.clientes add column if not exists ativo boolean not null default true;
alter table public.products add column if not exists trading text;
alter table public.products add column if not exists fornecedor text;
alter table public.products add column if not exists ativo boolean not null default true;
alter table public.products add column if not exists inativado_em timestamptz;
alter table public.sales add column if not exists estornado_por uuid references auth.users(id) on delete set null;
alter table public.sales add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.sale_items add column if not exists estornado_por uuid references auth.users(id) on delete set null;
alter table public.sale_payments add column if not exists status text not null default 'ativo';
alter table public.sale_payments add column if not exists estornado_em timestamptz;
alter table public.sale_payments add column if not exists motivo_estorno text;
alter table public.sale_payments add column if not exists estornado_por uuid references auth.users(id) on delete set null;
alter table public.configuracoes_empresa add column if not exists slogan text;
alter table public.product_types add column if not exists label text;
alter table public.product_types add column if not exists icon text not null default 'ti-box';
alter table public.product_types add column if not exists sub text not null default 'Serial · sem qtd';
alter table public.product_types add column if not exists created_at timestamptz not null default now();
update public.product_types set label = coalesce(nullif(trim(label), ''), key);
alter table public.product_types alter column label set not null;
alter table public.products add column if not exists custo_base numeric(14,2) not null default 0;
alter table public.products add column if not exists reparos jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists descricao text;
alter table public.products add column if not exists status_aprovacao text not null default 'aprovado';
alter table public.products add column if not exists venda_origem_id uuid references public.sales(id) on delete set null;
alter table public.configuracoes_empresa add column if not exists logo_data text;
alter table public.configuracoes_empresa add column if not exists percentual_comissao_padrao numeric(7,4) not null default 5;
alter table public.comissoes_vendedores alter column percentual set default 5;
alter table public.comissoes_vendedores add column if not exists ativo boolean not null default true;
alter table public.user_profiles add column if not exists slug text;
alter table public.sale_items add column if not exists created_at timestamptz not null default now();
alter table public.sale_items add column if not exists custo_unit_snapshot numeric(14,2);
alter table public.sale_items add column if not exists reparos_snapshot numeric(14,2);
alter table public.sale_items add column if not exists custo_total_snapshot numeric(14,2);
alter table public.financial_movements add column if not exists applies_to_commission boolean not null default false;
alter table public.financial_movements add column if not exists deduction_type text;
update public.financial_movements set applies_to_commission = true, deduction_type = coalesce(deduction_type, 'adiantamento') where category = 'Vale para vendedor';

-- Garante a relação de fornecedor também ao atualizar bancos antigos.
alter table public.products drop constraint if exists products_fornecedor_fkey;
alter table public.products add constraint products_fornecedor_fkey
  foreign key (fornecedor) references public.suppliers(name)
  on update cascade not valid;

create or replace function public.fn_try_numeric(value text) returns numeric
language plpgsql immutable
as $fn$
begin
  return nullif(trim(value),'')::numeric;
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end
$fn$;

-- Congela o CMV antigo usando primeiro o snapshot gravado na propria venda.
-- O cadastro atual e usado somente para legados que nao possuem snapshot.
update public.sale_items as item
set custo_unit_snapshot = coalesce(item.custo_unit_snapshot, public.fn_try_numeric(item.product_snapshot->>'custo_base'),
      greatest(0, coalesce(public.fn_try_numeric(item.product_snapshot->>'custo'), product.custo, 0)
        - coalesce((select sum(coalesce(public.fn_try_numeric(repair->>'valor'),0)) from jsonb_array_elements(coalesce(item.product_snapshot->'reparos','[]'::jsonb)) repair),0)), 0),
    reparos_snapshot = coalesce(item.reparos_snapshot,
      (select sum(coalesce(public.fn_try_numeric(repair->>'valor'),0)) from jsonb_array_elements(coalesce(item.product_snapshot->'reparos','[]'::jsonb)) repair), 0)
from public.products as product
where product.id = item.product_id
  and (item.custo_unit_snapshot is null or item.reparos_snapshot is null);

update public.sale_items as item
set custo_unit_snapshot = coalesce(item.custo_unit_snapshot, public.fn_try_numeric(item.product_snapshot->>'custo_base'), public.fn_try_numeric(item.product_snapshot->>'custo'), 0),
    reparos_snapshot = coalesce(item.reparos_snapshot, (select sum(coalesce(public.fn_try_numeric(repair->>'valor'),0)) from jsonb_array_elements(coalesce(item.product_snapshot->'reparos','[]'::jsonb)) repair), 0)
where item.custo_unit_snapshot is null or item.reparos_snapshot is null;

update public.sale_items
set custo_total_snapshot = round((coalesce(custo_unit_snapshot,0) + coalesce(reparos_snapshot,0)) * coalesce(quantidade,1), 2)
where custo_total_snapshot is null;

alter table public.sale_items alter column custo_unit_snapshot set default 0;
alter table public.sale_items alter column reparos_snapshot set default 0;
alter table public.sale_items alter column custo_total_snapshot set default 0;
alter table public.sale_items alter column custo_unit_snapshot set not null;
alter table public.sale_items alter column reparos_snapshot set not null;
alter table public.sale_items alter column custo_total_snapshot set not null;

create or replace function public.fn_congela_cmv_sale_item() returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  snapshot_custo numeric := 0;
  snapshot_base numeric := 0;
  snapshot_reparos numeric := 0;
begin
  if tg_op = 'UPDATE' then
    new.custo_unit_snapshot := old.custo_unit_snapshot;
    new.reparos_snapshot := old.reparos_snapshot;
    new.custo_total_snapshot := old.custo_total_snapshot;
    return new;
  end if;

  if coalesce(new.custo_unit_snapshot,0) = 0
     and coalesce(new.reparos_snapshot,0) = 0
     and coalesce(new.custo_total_snapshot,0) = 0 then
    snapshot_reparos := coalesce((
      select sum(coalesce(public.fn_try_numeric(repair->>'valor'),0))
      from jsonb_array_elements(coalesce(new.product_snapshot->'reparos','[]'::jsonb)) repair
    ),0);
    snapshot_custo := coalesce(public.fn_try_numeric(new.product_snapshot->>'custo'),0);
    snapshot_base := coalesce(public.fn_try_numeric(new.product_snapshot->>'custo_base'), greatest(0,snapshot_custo-snapshot_reparos),0);

    if new.product_id is not null and snapshot_custo = 0 then
      select coalesce(p.custo_base,p.custo,0), coalesce(p.custo,0)
        into snapshot_base, snapshot_custo
      from public.products p where p.id = new.product_id;
      snapshot_reparos := greatest(0,snapshot_custo-snapshot_base);
    end if;

    new.custo_unit_snapshot := snapshot_base;
    new.reparos_snapshot := snapshot_reparos;
    new.custo_total_snapshot := round((snapshot_base+snapshot_reparos)*coalesce(new.quantidade,1),2);
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_congela_cmv_sale_item on public.sale_items;
create trigger trg_congela_cmv_sale_item
before insert or update on public.sale_items
for each row execute function public.fn_congela_cmv_sale_item();



-- Historico imutavel das comissoes. Nesta primeira fase, 100% e liberado imediatamente.
alter table public.comissoes_vendedores add column if not exists ativo boolean not null default true;
create table if not exists public.comissoes_movimentos (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete cascade,
  vendedor_id uuid references public.user_profiles(id) on delete set null,
  base_comissao numeric(14,2) not null default 0,
  percentual numeric(7,4) not null default 5 check (percentual between 0 and 100),
  valor_comissao numeric(14,2) not null default 0,
  valor_imediato numeric(14,2) not null default 0,
  valor_diferido numeric(14,2) not null default 0,
  status text not null default 'liberada' check (status in ('pendente','parcialmente_liberada','liberada','cancelada')),
  origem text not null default 'venda' check (origem in ('venda','migracao')),
  data_geracao timestamptz not null default now(),
  data_liberacao timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sale_item_id)
);

create index if not exists comissoes_movimentos_sale_idx on public.comissoes_movimentos(sale_id);
create index if not exists comissoes_movimentos_vendedor_data_idx on public.comissoes_movimentos(vendedor_id,data_geracao desc);
create index if not exists comissoes_movimentos_status_idx on public.comissoes_movimentos(status);

create or replace function public.fn_registra_comissao_item() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  venda public.sales%rowtype;
  taxa numeric(7,4);
  base numeric(14,2);
  comissao numeric(14,2);
begin
  if tg_op = 'UPDATE' then
    if old.status = new.status then return new; end if;
    update public.comissoes_movimentos
       set status = case when new.status = 'ativo' then 'liberada' else 'cancelada' end,
           data_liberacao = case when new.status = 'ativo' then coalesce(data_liberacao,now()) else data_liberacao end,
           updated_at = now()
     where sale_item_id = new.id;
    return new;
  end if;

  select * into venda from public.sales where id = new.sale_id;
  taxa := coalesce(
    (select percentual from public.comissoes_vendedores where user_id = venda.criado_por and ativo = true),
    (select percentual_comissao_padrao from public.configuracoes_empresa where id = 1),
    5
  );
  base := greatest(0, round(((coalesce(new.venda_unit,0)*coalesce(new.quantidade,1))-coalesce(new.custo_total_snapshot,0))::numeric,2));
  comissao := round((base*taxa/100)::numeric,2);

  insert into public.comissoes_movimentos (
    sale_id,sale_item_id,vendedor_id,base_comissao,percentual,valor_comissao,
    valor_imediato,valor_diferido,status,origem,data_geracao,data_liberacao
  ) values (
    new.sale_id,new.id,venda.criado_por,base,taxa,comissao,
    comissao,0,case when new.status = 'ativo' then 'liberada' else 'cancelada' end,
    'venda',coalesce(venda.created_at,now()),case when new.status = 'ativo' then now() else null end
  )
  on conflict (sale_item_id) do nothing;
  return new;
end
$fn$;

drop trigger if exists trg_registra_comissao_item on public.sale_items;
create trigger trg_registra_comissao_item
after insert or update of status on public.sale_items
for each row execute function public.fn_registra_comissao_item();

-- Vendas anteriores recebem um movimento estimado com a regra configurada na migracao.
insert into public.comissoes_movimentos (
  sale_id,sale_item_id,vendedor_id,base_comissao,percentual,valor_comissao,
  valor_imediato,valor_diferido,status,origem,data_geracao,data_liberacao
)
select sale.id,item.id,sale.criado_por,
       calc.base,calc.taxa,round((calc.base*calc.taxa/100)::numeric,2),
       round((calc.base*calc.taxa/100)::numeric,2),0,
       case when item.status = 'ativo' then 'liberada' else 'cancelada' end,
       'migracao',coalesce(sale.created_at,now()),
       case when item.status = 'ativo' then coalesce(sale.created_at,now()) else null end
from public.sale_items item
join public.sales sale on sale.id = item.sale_id
cross join lateral (
  select
    greatest(0,round(((coalesce(item.venda_unit,0)*coalesce(item.quantidade,1))-coalesce(item.custo_total_snapshot,0))::numeric,2)) as base,
    coalesce(
      (select percentual from public.comissoes_vendedores where user_id = sale.criado_por and ativo = true),
      (select percentual_comissao_padrao from public.configuracoes_empresa where id = 1),5
    )::numeric(7,4) as taxa
) calc
on conflict (sale_item_id) do nothing;

alter table public.comissoes_movimentos enable row level security;
grant select on public.comissoes_movimentos to authenticated;



-- Despesas por competencia e por data de pagamento.
create table if not exists public.categorias_despesas (
  id uuid primary key default gen_random_uuid(), nome text not null unique,
  ativo boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.categorias_despesas(nome) values
 ('Aluguel'),('Salários'),('Marketing'),('Contabilidade'),('Sistema'),('Energia'),
 ('Internet'),('Manutenção'),('Garantias'),('Frete'),('Impostos'),('Outros')
on conflict (nome) do nothing;

create table if not exists public.despesas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria_id uuid not null references public.categorias_despesas(id),
  competencia date not null,
  vencimento date not null,
  data_pagamento date,
  valor numeric(14,2) not null check (valor > 0),
  status text not null default 'pendente' check (status in ('pendente','paga','vencida','cancelada')),
  tipo text not null default 'variavel' check (tipo in ('fixa','variavel')),
  recorrente boolean not null default false,
  observacao text,
  financial_movement_id uuid unique references public.financial_movements(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'paga' and data_pagamento is not null) or status <> 'paga')
);
create index if not exists despesas_competencia_idx on public.despesas(competencia);
create index if not exists despesas_pagamento_idx on public.despesas(data_pagamento) where data_pagamento is not null;
create index if not exists despesas_vencimento_status_idx on public.despesas(vencimento,status);
create index if not exists despesas_categoria_idx on public.despesas(categoria_id);

insert into public.categorias_despesas(nome)
select distinct coalesce(nullif(trim(category),''),'Outros') from public.financial_movements
where movement_type='despesa' and not coalesce(applies_to_commission,false)
on conflict (nome) do nothing;

insert into public.despesas (
 descricao,categoria_id,competencia,vencimento,data_pagamento,valor,status,tipo,
 recorrente,observacao,financial_movement_id,created_by,updated_by,created_at,updated_at
)
select movement.description,category.id,date_trunc('month',movement.movement_date)::date,
 movement.movement_date,movement.movement_date,movement.amount,
 case when movement.status='cancelado' then 'cancelada' else 'paga' end,
 'variavel',false,movement.notes,movement.id,movement.created_by,movement.updated_by,
 movement.created_at,movement.updated_at
from public.financial_movements movement
join public.categorias_despesas category on category.nome=coalesce(nullif(trim(movement.category),''),'Outros')
where movement.movement_type='despesa'
  and not coalesce(movement.applies_to_commission,false)
on conflict (financial_movement_id) do nothing;

update public.despesas expense
set status='cancelada',updated_at=now()
from public.financial_movements movement
where expense.financial_movement_id=movement.id
  and coalesce(movement.applies_to_commission,false)
  and expense.status<>'cancelada';

create or replace function public.fn_sincroniza_despesa_movimento() returns trigger
language plpgsql security definer set search_path=public
as $fn$
declare categoria uuid;
begin
 if new.movement_type<>'despesa' then return new; end if;
 if coalesce(new.applies_to_commission,false) then
   update public.despesas set status='cancelada',updated_at=now()
   where financial_movement_id=new.id and status<>'cancelada';
   return new;
 end if;
 insert into public.categorias_despesas(nome) values(coalesce(nullif(trim(new.category),''),'Outros'))
 on conflict (nome) do update set ativo=true returning id into categoria;
 insert into public.despesas (
  descricao,categoria_id,competencia,vencimento,data_pagamento,valor,status,tipo,
  recorrente,observacao,financial_movement_id,created_by,updated_by,created_at,updated_at
 ) values (
  new.description,categoria,date_trunc('month',new.movement_date)::date,new.movement_date,
  new.movement_date,new.amount,case when new.status='cancelado' then 'cancelada' else 'paga' end,
  'variavel',false,new.notes,new.id,new.created_by,new.updated_by,new.created_at,new.updated_at
 )
 on conflict (financial_movement_id) do update set
  descricao=excluded.descricao,categoria_id=excluded.categoria_id,valor=excluded.valor,
  status=excluded.status,observacao=excluded.observacao,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 return new;
end
$fn$;
drop trigger if exists trg_sincroniza_despesa_movimento on public.financial_movements;
create trigger trg_sincroniza_despesa_movimento after insert or update on public.financial_movements
for each row execute function public.fn_sincroniza_despesa_movimento();

create or replace view public.dre_despesas_mensais as
select date_trunc('month',competencia)::date competencia,categoria_id,sum(valor)::numeric(14,2) total
from public.despesas where status<>'cancelada' group by 1,categoria_id;
create or replace view public.fluxo_caixa_despesas_mensais as
select date_trunc('month',data_pagamento)::date mes_pagamento,categoria_id,sum(valor)::numeric(14,2) total
from public.despesas where status='paga' and data_pagamento is not null group by 1,categoria_id;

alter table public.categorias_despesas enable row level security;
alter table public.despesas enable row level security;


alter table public.sale_payments add column if not exists created_at timestamptz not null default now();

-- Corrige também vendas antigas: o total final é a soma efetivamente paga,
-- incluindo os juros de cartão já armazenados em sale_payments.valor.
create or replace view public.vendas_totais_divergentes as
select sale.id as sale_id,sale.total as total_registrado,payments.total_pago,
       round((payments.total_pago-sale.total)::numeric,2) as diferenca
from public.sales sale
join (
  select sale_id,round(sum(valor)::numeric,2) as total_pago
  from public.sale_payments where status <> 'estornado' group by sale_id
) payments on payments.sale_id=sale.id
where abs(sale.total-payments.total_pago)>0.009;
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
    'products','product_types','suppliers','product_photos','clientes','fabricantes','sales',
    'sale_items','sale_payments','protecao_planos','bandeiras_cartao',
    'taxas_cartao','configuracoes_empresa','comissoes_vendedores'
  ] loop
    execute format('alter table public.%I add column if not exists ativo boolean not null default true', tabela);
    execute format('alter table public.%I add column if not exists inativado_em timestamptz', tabela);
    execute format('alter table public.%I add column if not exists criado_por uuid references auth.users(id)', tabela);
    execute format('alter table public.%I add column if not exists atualizado_por uuid references auth.users(id)', tabela);
  end loop;
end $sql$;

-- Mantem o cadastro unificado de pessoas sincronizado com a tabela usada
-- pela chave estrangeira products.fornecedor.
create or replace function public.fn_sincroniza_fornecedor() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.fornecedor and new.ativo then
    insert into public.suppliers(name, ativo, inativado_em)
    values (trim(new.nome), true, null)
    on conflict (name) do update
      set ativo = true, inativado_em = null;
  end if;

  if tg_op = 'UPDATE'
     and old.fornecedor
     and (not new.fornecedor or not new.ativo or old.nome is distinct from new.nome)
     and not exists (
       select 1
       from public.clientes c
       where c.id <> new.id
         and c.fornecedor
         and c.ativo
         and c.nome = old.nome
     )
     and not exists (
       select 1
       from public.products p
       where p.ativo
         and p.fornecedor = old.nome
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

-- Repara fornecedores antigos criados apenas em clientes e qualquer nome ja
-- usado por produtos antes da instalacao desta versao do banco.
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

-- ------------------------------------------------------------
-- REGRAS DE INTEGRIDADE
-- ------------------------------------------------------------

alter table public.configuracoes_empresa
  drop constraint if exists configuracoes_empresa_percentual_comissao_padrao_check;
alter table public.configuracoes_empresa
  add constraint configuracoes_empresa_percentual_comissao_padrao_check
  check (percentual_comissao_padrao between 0 and 100) not valid;

alter table public.comissoes_vendedores
  drop constraint if exists comissoes_vendedores_percentual_check;
alter table public.comissoes_vendedores
  add constraint comissoes_vendedores_percentual_check
  check (percentual between 0 and 100) not valid;

alter table public.products drop constraint if exists products_kind_check;
alter table public.products add constraint products_kind_check
  check (nullif(trim(kind), '') is not null) not valid;

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

alter table public.sale_payments drop constraint if exists sale_payments_status_check;
alter table public.sale_payments add constraint sale_payments_status_check
  check (status in ('ativo','estornado')) not valid;
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

create index if not exists idx_product_types_label on public.product_types(lower(label));
create index if not exists financial_movements_date_idx on public.financial_movements(movement_date desc);
create index if not exists financial_movements_type_idx on public.financial_movements(movement_type,status);
create index if not exists financial_movements_seller_idx on public.financial_movements(seller_id);
create index if not exists financial_movements_commission_deduction_idx on public.financial_movements(seller_id,movement_date desc) where applies_to_commission = true;
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
      fornecedor, trading, nome, quantidade, custo, custo_base, reparos, venda, categoria,
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
      new.product_snapshot->>'trading',
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
    'products','product_types','suppliers','product_photos','clientes','fabricantes','sales',
    'sale_items','sale_payments','protecao_planos','bandeiras_cartao',
    'taxas_cartao','configuracoes_empresa','comissoes_vendedores'
  ] loop
    execute format('drop trigger if exists trg_auditoria_usuario on public.%I', tabela);
    execute format('create trigger trg_auditoria_usuario before insert or update on public.%I for each row execute function public.fn_auditoria_usuario()', tabela);
  end loop;
end $sql$;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------

-- Movimentações financeiras são acessadas somente pela API administrativa
-- usando a service role. Usuários autenticados não recebem policy direta.
alter table public.financial_movements enable row level security;
drop policy if exists authenticated_access on public.financial_movements;
drop policy if exists authenticated_read on public.financial_movements;
drop policy if exists authenticated_insert on public.financial_movements;
drop policy if exists authenticated_update on public.financial_movements;
drop policy if exists authenticated_delete on public.financial_movements;

do $sql$
declare tabela text;
begin
  foreach tabela in array array[
    'products','product_types','suppliers','product_photos','clientes','fabricantes','sales',
    'sale_items','sale_payments','protecao_planos','bandeiras_cartao',
    'taxas_cartao','configuracoes_empresa','comissoes_vendedores'
  ] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('drop policy if exists authenticated_access on public.%I', tabela);
    execute format('drop policy if exists authenticated_read on public.%I', tabela);
    execute format('drop policy if exists authenticated_insert on public.%I', tabela);
    execute format('drop policy if exists authenticated_update on public.%I', tabela);
    execute format('drop policy if exists authenticated_delete on public.%I', tabela);
    -- A aplicacao filtra os inativos nas consultas. Permitir a leitura da linha
    -- inativa e necessario para que ON CONFLICT/UPSERT consiga reativa-la.
    execute format('create policy authenticated_read on public.%I for select to authenticated using (true)', tabela);
    execute format('create policy authenticated_insert on public.%I for insert to authenticated with check (true)', tabela);
    execute format('create policy authenticated_update on public.%I for update to authenticated using (true) with check (true)', tabela);
  end loop;
end $sql$;

-- Percentuais de comissao sao confidenciais e administrados somente por admin.
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

drop policy if exists admins_read_commission_movements on public.comissoes_movimentos;
create policy admins_read_commission_movements on public.comissoes_movimentos
for select to authenticated using (public.fn_is_admin());

drop policy if exists admins_read_expense_categories on public.categorias_despesas;
drop policy if exists admins_read_expenses on public.despesas;
create policy admins_read_expense_categories on public.categorias_despesas for select to authenticated using (public.fn_is_admin());
create policy admins_read_expenses on public.despesas for select to authenticated using (public.fn_is_admin());
grant select on public.categorias_despesas, public.despesas to authenticated;

-- Configurações da empresa podem ser lidas pelos usuários, mas alteradas somente por admin.
drop policy if exists authenticated_read on public.configuracoes_empresa;
drop policy if exists authenticated_insert on public.configuracoes_empresa;
drop policy if exists authenticated_update on public.configuracoes_empresa;
create policy authenticated_read on public.configuracoes_empresa
for select to authenticated using (true);
create policy authenticated_insert on public.configuracoes_empresa
for insert to authenticated with check (public.fn_is_admin());
create policy authenticated_update on public.configuracoes_empresa
for update to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

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
insert into public.product_types(key,label,icon,sub)
values
  ('celular','Celular','ti-device-mobile','IMEI · sem qtd'),
  ('ipad','iPad','ti-device-tablet','Serial · sem qtd'),
  ('mac','Mac','ti-device-laptop','Serial · sem qtd'),
  ('jbl','JBL / Áudio','ti-speaker','Serial · sem qtd'),
  ('acessorio','Acessório','ti-cable','Com quantidade')
on conflict (key) do update
set label = excluded.label, icon = excluded.icon, sub = excluded.sub, ativo = true, inativado_em = null;

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

-- ------------------------------------------------------------
-- ENDURECIMENTO FINAL DE PRIVILÉGIOS
-- ------------------------------------------------------------

do $sql$
declare tabela text;
begin
  foreach tabela in array array[
    'products','product_types','suppliers','product_photos','clientes','fabricantes','sales',
    'sale_items','sale_payments','protecao_planos','bandeiras_cartao','taxas_cartao',
    'configuracoes_empresa','comissoes_vendedores','comissoes_movimentos',
    'categorias_despesas','despesas','user_profiles','financial_movements'
  ] loop
    if to_regclass('public.' || tabela) is not null then
      execute format('alter table public.%I enable row level security', tabela);
    end if;
  end loop;
end $sql$;

revoke all on all tables in schema public from anon;
grant select on public.configuracoes_empresa to anon;
revoke all on public.financial_movements from anon, authenticated;

-- Cadastros estruturais somente podem ser alterados por administradores.
do $sql$
declare tabela text;
begin
  foreach tabela in array array[
    'products','product_types','suppliers','product_photos','fabricantes',
    'protecao_planos','bandeiras_cartao','taxas_cartao'
  ] loop
    execute format('drop policy if exists authenticated_insert on public.%I', tabela);
    execute format('drop policy if exists authenticated_update on public.%I', tabela);
    execute format('create policy authenticated_insert on public.%I for insert to authenticated with check ((select public.fn_is_admin()))', tabela);
    execute format('create policy authenticated_update on public.%I for update to authenticated using ((select public.fn_is_admin())) with check ((select public.fn_is_admin()))', tabela);
  end loop;
end $sql$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.fn_is_admin() to authenticated;

-- Preserva a RPC de estorno em bancos que já a possuam.
do $sql$
declare func regprocedure;
begin
  for func in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_estornar_venda'
  loop
    execute format('grant execute on function %s to authenticated', func);
  end loop;
end $sql$;

alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables from anon;

commit;

-- Fim do arquivo. Após executar, recarregue o projeto para atualizar o cache do PostgREST.
