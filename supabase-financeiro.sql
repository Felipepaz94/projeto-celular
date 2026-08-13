-- Execute no SQL Editor do Supabase para habilitar entradas e despesas.
create table if not exists public.financial_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null check (movement_type in ('entrada','despesa')),
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  movement_date date not null default current_date,
  seller_id uuid null references public.user_profiles(id) on delete set null,
  seller_name text null,
  notes text null,
  status text not null default 'ativo' check (status in ('ativo','cancelado')),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists financial_movements_date_idx on public.financial_movements(movement_date desc);
create index if not exists financial_movements_type_idx on public.financial_movements(movement_type,status);
create index if not exists financial_movements_seller_idx on public.financial_movements(seller_id);
alter table public.financial_movements enable row level security;
-- O acesso é feito exclusivamente pela API administrativa com service role.