// Public Supabase settings (safe to ship: access is limited by row-level security).
// Empty URL = cloud sync off; the app keeps working only on this device.
export const NUBE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://jlnaavvofqgxpkpuxgoo.supabase.co'
export const NUBE_CLAVE = import.meta.env.VITE_SUPABASE_CLAVE ?? 'sb_publishable_wNRGGbPhiMIUoo0UaN_CdQ_X3Uh31vd'
