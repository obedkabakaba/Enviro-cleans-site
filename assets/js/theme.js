(function () {
  var filename = location.pathname.split('/').pop() || 'index.html';
  var page = filename.replace(/\.html$/i, '') || 'index';
  document.body.dataset.page = page;

  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function iconMarkup(theme) {
    if (theme === 'dark') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  function updateButton(button) {
    var theme = currentTheme();
    button.innerHTML = iconMarkup(theme);
    button.setAttribute('aria-label', theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre');
    button.title = theme === 'dark' ? 'Mode clair' : 'Mode sombre';
  }

  function applyTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if (persist) localStorage.setItem('enviro-theme', theme);
    document.querySelectorAll('.theme-toggle').forEach(updateButton);
  }

  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle';
  button.addEventListener('click', function () {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  });
  updateButton(button);

  var topbar = document.querySelector('.topbar-right');
  var nav = document.querySelector('body > nav');
  if (topbar) {
    topbar.insertBefore(button, topbar.firstChild);
  } else if (nav) {
    var hamburger = nav.querySelector('.hamburger');
    nav.insertBefore(button, hamburger || null);
  } else {
    button.classList.add('theme-toggle-floating');
    document.body.appendChild(button);
  }

  window.addEventListener('storage', function (event) {
    if (event.key === 'enviro-theme' && (event.newValue === 'light' || event.newValue === 'dark')) {
      applyTheme(event.newValue, false);
    }
  });
})();
