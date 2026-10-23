-- Rota Brasil: autenticação, histórico do cliente e painel administrativo
-- Execute uma vez no SQL Editor do projeto Supabase sunasnvfjsmyuwfqpttr.
-- A migração é aditiva: preserva as solicitações antigas.

alter table public.solicitacoes_orcamento
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists solicitacoes_orcamento_user_id_idx
  on public.solicitacoes_orcamento(user_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "profile select own" on public.profiles;
create policy "profile select own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists "profile update own" on public.profiles;
create policy "profile update own" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
drop policy if exists "admin user select own" on public.admin_users;
create policy "admin user select own" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

grant select, update on public.profiles to authenticated;
grant select on public.admin_users to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user();

drop policy if exists "envio publico de solicitacao" on public.solicitacoes_orcamento;
create policy "envio publico de solicitacao" on public.solicitacoes_orcamento
  for insert to anon, authenticated
  with check (
    ((select auth.uid()) is null and user_id is null)
    or user_id = (select auth.uid())
  );
drop policy if exists "cliente consulta proprias solicitacoes" on public.solicitacoes_orcamento;
create policy "cliente consulta proprias solicitacoes" on public.solicitacoes_orcamento
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  );
drop policy if exists "administrador atualiza solicitacoes" on public.solicitacoes_orcamento;
create policy "administrador atualiza solicitacoes" on public.solicitacoes_orcamento
  for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

grant insert on public.solicitacoes_orcamento to anon, authenticated;
grant select on public.solicitacoes_orcamento to authenticated;
grant update (status) on public.solicitacoes_orcamento to authenticated;

-- Após criar uma conta pelo site e confirmar o e-mail, promova o administrador manualmente:
-- substitua o e-mail abaixo pelo e-mail exato da conta administradora:
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'SEU-EMAIL-AQUI'
-- on conflict (user_id) do nothing;
