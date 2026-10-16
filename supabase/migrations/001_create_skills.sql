-- SkillNic: persistent, user-owned skills.
create extension if not exists pgcrypto;

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  title text not null,
  description text not null default '',
  content text not null,
  scope text not null default 'user'
    check (scope in ('conversation', 'project', 'user')),
  project_key text,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  check (name ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  check (char_length(title) between 1 and 120),
  check (char_length(content) between 1 and 50000),
  check (char_length(description) <= 1000),
  check (project_key is null or char_length(project_key) <= 160)
);

create index if not exists skills_user_scope_updated_idx
  on public.skills (user_id, scope, updated_at desc);
create index if not exists skills_user_active_idx
  on public.skills (user_id, is_active);

create or replace function public.set_skill_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.content is distinct from old.content
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.tags is distinct from old.tags
     or new.scope is distinct from old.scope
     or new.project_key is distinct from old.project_key
     or new.is_active is distinct from old.is_active then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists skills_set_updated_at on public.skills;
create trigger skills_set_updated_at
before update on public.skills
for each row execute function public.set_skill_updated_at();

alter table public.skills enable row level security;

drop policy if exists "Users can read their own skills" on public.skills;
create policy "Users can read their own skills"
  on public.skills for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own skills" on public.skills;
create policy "Users can insert their own skills"
  on public.skills for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own skills" on public.skills;
create policy "Users can update their own skills"
  on public.skills for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own skills" on public.skills;
create policy "Users can delete their own skills"
  on public.skills for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.skills to authenticated;
