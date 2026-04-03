export function applyAdminThemeToDocument(theme: 'light' | 'dark') {
  document.body.classList.add('forja-theme-root');
  document.body.dataset.theme = theme;
}

export function clearAdminThemeFromDocument() {
  document.body.classList.remove('forja-theme-root');
  delete document.body.dataset.theme;
}
