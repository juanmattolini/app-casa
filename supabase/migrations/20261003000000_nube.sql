-- Cloud copy of the app's local tables. One generic table: each row is one local record
-- (task, material, photo, quote, room or setting) stored as JSON, so new fields in the app
-- sync without schema changes. Photos and PDFs live in the private "archivos" bucket.

create table public.registros (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tabla text not null check (tabla in ('habitaciones', 'tareas', 'materiales', 'fotos', 'presupuestos', 'meta')),
  uid text not null,
  datos jsonb not null default '{}'::jsonb,
  archivos jsonb not null default '{}'::jsonb,
  borrado boolean not null default false,
  actualizado timestamptz not null default clock_timestamp(),
  primary key (user_id, tabla, uid)
);

create index registros_user_actualizado on public.registros (user_id, actualizado);

-- The server sets the timestamp, so devices with a wrong clock still sync in order.
create function public.registros_marcar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado := clock_timestamp();
  return new;
end;
$$;

create trigger registros_actualizado
before insert or update on public.registros
for each row execute function public.registros_marcar_actualizado();

alter table public.registros enable row level security;

create policy "ver lo propio" on public.registros
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "crear lo propio" on public.registros
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "cambiar lo propio" on public.registros
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "borrar lo propio" on public.registros
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Files: archivos/<user id>/<record uid>/<field>-<timestamp>
insert into storage.buckets (id, name, public, file_size_limit)
values ('archivos', 'archivos', false, 20971520)
on conflict (id) do nothing;

create policy "archivos: ver lo propio" on storage.objects
  for select to authenticated
  using (bucket_id = 'archivos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "archivos: subir lo propio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'archivos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "archivos: cambiar lo propio" on storage.objects
  for update to authenticated
  using (bucket_id = 'archivos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "archivos: borrar lo propio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'archivos' and (storage.foldername(name))[1] = (select auth.uid())::text);
