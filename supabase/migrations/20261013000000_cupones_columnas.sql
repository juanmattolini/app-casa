-- Cupones: la app solo manda la oferta. Antes un usuario con sesión podía mandar también su propio
-- código o la fecha de canje ("canjeado") al crear el cupón, y así presentarse como ya canjeado o
-- con un código inventado. Ahora solo puede elegir oferta_id; el resto lo pone la base (valores por defecto).
revoke insert, update, delete on public.cupones from anon, authenticated;
grant insert (oferta_id) on public.cupones to authenticated;

-- Las ofertas y la caché de Mercado Libre solo las cambia quien administra la app.
revoke insert, update, delete on public.ofertas from anon, authenticated;
revoke insert, update, delete on public.ml_cache from anon, authenticated;
revoke select on public.ml_cache from anon, authenticated;
