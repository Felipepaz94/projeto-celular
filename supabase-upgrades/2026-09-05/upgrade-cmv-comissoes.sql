-- Migracao aditiva e idempotente: pode ser executada mais de uma vez.
-- Nao remove nem recria tabelas e nunca recalcula snapshots ja congelados.
begin;

create extension if not exists pgcrypto;

-- Dependencia criada aqui para que este arquivo possa ser aplicado sozinho
-- sobre qualquer versao anterior que ja possua as tabelas principais.
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

create or replace function public.fn_is_admin() returns boolean
language sql stable security definer set search_path=public
as $fn$
  select exists(select 1 from public.user_profiles where id=auth.uid() and role='admin');
$fn$;

create or replace function public.fn_try_numeric(value text) returns numeric
language plpgsql immutable
as $fn$
begin
  return nullif(trim(value),'')::numeric;
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end
$fn$;

alter table public.sales add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.configuracoes_empresa add column if not exists percentual_comissao_padrao numeric(7,4) not null default 5;
create table if not exists public.comissoes_vendedores (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  percentual numeric(7,4) not null default 5 check (percentual between 0 and 100),
  updated_at timestamptz not null default now()
);

-- Deducoes de comissao: ampliacao aditiva dos vales existentes.
alter table public.financial_movements add column if not exists applies_to_commission boolean not null default false;
alter table public.financial_movements add column if not exists deduction_type text;
update public.financial_movements set applies_to_commission = true, deduction_type = coalesce(deduction_type, 'adiantamento') where category = 'Vale para vendedor';
create index if not exists financial_movements_commission_deduction_idx on public.financial_movements(seller_id,movement_date desc) where applies_to_commission = true;

alter table public.sale_items add column if not exists custo_unit_snapshot numeric(14,2);
alter table public.sale_items add column if not exists reparos_snapshot numeric(14,2);
alter table public.sale_items add column if not exists custo_total_snapshot numeric(14,2);

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

comment on column public.sale_items.custo_unit_snapshot is 'Custo base unitario congelado no momento da venda.';
comment on column public.sale_items.reparos_snapshot is 'Total unitario de reparos congelado no momento da venda.';
comment on column public.sale_items.custo_total_snapshot is 'CMV total da linha: (custo unitario + reparos) x quantidade.';

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
drop policy if exists admins_read_commission_movements on public.comissoes_movimentos;
create policy admins_read_commission_movements on public.comissoes_movimentos
for select to authenticated using (public.fn_is_admin());
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

-- Versoes anteriores podiam espelhar vales/deducoes na DRE. O registro nao e
-- apagado: apenas fica cancelado para nao distorcer o resultado contabil.
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
drop policy if exists admins_read_expense_categories on public.categorias_despesas;
drop policy if exists admins_read_expenses on public.despesas;
create policy admins_read_expense_categories on public.categorias_despesas for select to authenticated using (public.fn_is_admin());
create policy admins_read_expenses on public.despesas for select to authenticated using (public.fn_is_admin());
grant select on public.categorias_despesas, public.despesas to authenticated;


commit;
