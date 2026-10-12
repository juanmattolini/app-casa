-- Uso del asistente (la Edge Function "asistente"): cuántas consultas hizo cada usuario por día y cuántos
-- tokens gastaron, para el límite diario y para ver el costo. Solo la toca la función con la service role:
-- RLS activo y sin policies, así que la app (anon / authenticated) no puede leerla ni escribirla.

create table public.asistente_uso (
  user_id uuid not null references auth.users (id) on delete cascade,
  dia date not null,                          -- día en hora de Argentina
  consultas integer not null default 0,
  tokens_entrada bigint not null default 0,
  tokens_salida bigint not null default 0,
  primary key (user_id, dia)
);

alter table public.asistente_uso enable row level security;

-- Suma una consulta si todavía no llegó al límite del día. Devuelve el número de consulta o -1 si ya no quedan.
-- Atómica: dos consultas al mismo tiempo no pueden pasarse del límite.
create function public.asistente_contar(p_user uuid, p_limite integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.asistente_uso as u (user_id, dia, consultas)
  values (p_user, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 1)
  on conflict (user_id, dia) do update set consultas = u.consultas + 1
    where u.consultas < p_limite
  returning consultas into n;
  return coalesce(n, -1);
end;
$$;

-- Tokens de la respuesta, para saber cuánto costó cada día.
create function public.asistente_tokens(p_user uuid, p_entrada integer, p_salida integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.asistente_uso
     set tokens_entrada = tokens_entrada + p_entrada, tokens_salida = tokens_salida + p_salida
   where user_id = p_user and dia = (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

revoke execute on function public.asistente_contar(uuid, integer) from public, anon, authenticated;
revoke execute on function public.asistente_tokens(uuid, integer, integer) from public, anon, authenticated;
