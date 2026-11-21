// Apply the saved theme before first paint so there is no flash. Loaded as a file
// because the engine's Content-Security-Policy blocks inline scripts. The ids are the ones in
// packages/api (THEME_IDS) plus the old 'dark' and 'light'; a test keeps the lists in step.
try {
  var t = localStorage.getItem('fc-theme')
  var known = [
    'dark',
    'light',
    'graphite',
    'slate',
    'moonlight',
    'forest',
    'ember',
    'obsidian',
    'daylight',
    'mist',
    'linen',
    'contrast',
  ]
  if (known.indexOf(t) !== -1) document.documentElement.dataset.theme = t
} catch {
  // Storage blocked (private mode): the system theme applies.
}
