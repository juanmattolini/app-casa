-- Ofertas de comercios auspiciantes (ferreterías, corralones, pinturerías...) y cupones de los usuarios.
-- Las ofertas las carga el dueño de la app (panel de Supabase o service role): los usuarios solo las leen.
-- Cada usuario con sesión puede generar UN cupón por oferta; el código queda registrado para que el
-- comercio pueda verificarlo y para medir cuántos cupones se generan y se canjean.

create table public.ofertas (
  id uuid primary key default gen_random_uuid(),
  comercio text not null,
  direccion text,
  zona text,                                  -- barrio o ciudad donde aplica
  rubro text,                                 -- ferretería, pinturería, corralón...
  titulo text not null,                       -- "15% en pintura y accesorios"
  detalle text,                               -- condiciones en una o dos frases
  descuento text not null,                    -- texto corto para la etiqueta: "15% OFF"
  palabras text[] not null default '{}',      -- palabras que, si están en la lista de compras, hacen la oferta relevante
  vigente_hasta date,
  activa boolean not null default true,
  orden integer not null default 0,
  creada timestamptz not null default now()
);

alter table public.ofertas enable row level security;

create policy "ver ofertas vigentes" on public.ofertas
  for select to anon, authenticated
  using (activa and (vigente_hasta is null or vigente_hasta >= current_date));

create table public.cupones (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  codigo text not null unique default ('CASA-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  creado timestamptz not null default now(),
  canjeado timestamptz,                       -- lo marca el comercio / el dueño de la app (service role)
  unique (oferta_id, user_id)
);

alter table public.cupones enable row level security;

create policy "ver mis cupones" on public.cupones
  for select to authenticated using (user_id = (select auth.uid()));
create policy "crear mis cupones" on public.cupones
  for insert to authenticated with check (user_id = (select auth.uid()));
-- Sin policy de update/delete para usuarios: el canje solo lo registra quien administra la app.

create index cupones_oferta on public.cupones (oferta_id);

-- Ejemplo para probar (descomentar y adaptar):
-- insert into public.ofertas (comercio, direccion, zona, rubro, titulo, detalle, descuento, palabras, vigente_hasta)
-- values ('Ferretería Tu Barrio', 'Calle Ejemplo 123', 'Mi barrio', 'Ferretería',
--         '15% en pintura, brochas y lijas', 'Presentando el cupón de APP CASA. No acumulable con otras promociones.',
--         '15% OFF', array['pintura', 'brocha', 'lija', 'esmalte'], current_date + 60);
