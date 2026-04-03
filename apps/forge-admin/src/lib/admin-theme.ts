export function applyAdminThemeToDocument(theme: 'light' | 'dark') {
  document.body.classList.add('forja-theme-root');
  document.body.classList.toggle('dark', theme === 'dark');
}

export function clearAdminThemeFromDocument() {
  document.body.classList.remove('forja-theme-root');
  document.body.classList.remove('dark');
}
