// Google Analytics 4: only counts visits (page_view), never task data.
// Paste the measurement ID (G-XXXXXXXXXX) here or set VITE_GA_ID. Empty = analytics off.
export const GA_ID = import.meta.env.VITE_GA_ID ?? ''

export function iniciarAnalitica() {
  // Skip the single-file preview and local dev so only real visits to the site count.
  if (!/^G-[A-Z0-9]+$/.test(GA_ID) || import.meta.env.MODE === 'single' || import.meta.env.DEV) return
  window.dataLayer = window.dataLayer || []
  window.gtag = function () { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', GA_ID, {
    page_title: 'APP CASA',
    page_location: location.origin + location.pathname,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })
  const s = document.createElement('script')
  s.async = true
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID
  document.head.appendChild(s)
}
