// Apply the saved theme before first paint so there is no flash. Loaded as a file
// because the engine's Content-Security-Policy blocks inline scripts.
try {
  var t = localStorage.getItem('fc-theme')
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t
} catch {
  // Storage blocked (private mode): the system theme applies.
}
