// Applique le thème avant le premier affichage pour éviter un flash clair.
// Fichier séparé (et non script en ligne) pour respecter la Content-Security-Policy.
(function () {
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem('hermes.theme');
  } catch {
    // Stockage indisponible (navigation privée stricte) : thème du système
  }
  if (
    savedTheme === 'dark' ||
    (savedTheme === null && matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    document.documentElement.classList.add('dark-theme');
  }
})();
