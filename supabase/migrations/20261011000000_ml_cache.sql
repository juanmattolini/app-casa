-- Caché de búsquedas en Mercado Libre (la usa la Edge Function "ml-buscar").
-- Guarda las 3 opciones y el precio de referencia de cada consulta durante ~24 h, para no gastar
-- la cuota de la API y responder rápido. Solo la lee y escribe la función con la service role:
-- RLS activo y sin policies, así que la app (anon / authenticated) no puede tocarla.

create table public.ml_cache (
  consulta text primary key,                 -- "MLA:pintura esmalte blanco" (sitio + texto normalizado)
  datos jsonb not null,                      -- { opciones: [...], referencia, moneda }
  creado timestamptz not null default now()
);

alter table public.ml_cache enable row level security;

create index ml_cache_creado on public.ml_cache (creado);
