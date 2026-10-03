-- New local tables: appliances (aparatos) and repair contacts (contactos).
alter table public.registros drop constraint registros_tabla_check;
alter table public.registros add constraint registros_tabla_check
  check (tabla in ('habitaciones', 'tareas', 'materiales', 'fotos', 'presupuestos', 'meta', 'aparatos', 'contactos'));
