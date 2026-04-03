export function applyAdminThemeToDocument(theme: 'light' | 'dark') {
  document.body.dataset.adminUi = 'new';
  document.body.classList.add('forja-theme-root');
  document.body.dataset.theme = theme;
}

export function clearAdminThemeFromDocument() {
  delete document.body.dataset.adminUi;
  document.body.classList.remove('forja-theme-root');
  delete document.body.dataset.theme;
}
