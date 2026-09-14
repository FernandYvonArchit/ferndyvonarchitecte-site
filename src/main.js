// Menu mobile (hamburger) — ouvre/ferme la navigation sur petit écran.
(function () {
  var sidebar = document.getElementById('site-sidebar');
  var toggle = sidebar && sidebar.querySelector('.menu-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', function () {
    var open = sidebar.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();
