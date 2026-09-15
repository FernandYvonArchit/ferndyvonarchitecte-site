#!/usr/bin/env node
/**
 * Générateur statique du site Fernand Yvon Architectes.
 * Lit le contenu dans content/ (éditable via Pages CMS) et produit
 * un site HTML statique dans dist/, prêt à être servi tel quel par
 * Cloudflare Pages. Aucune dépendance externe.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CONTENT = path.join(ROOT, 'content');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// ---------- utilitaires ----------
function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function esc(s) {
  s = (s === undefined || s === null) ? '' : String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeFile(p, content) { mkdirp(path.dirname(p)); fs.writeFileSync(p, content); }
function copyDir(from, to) {
  mkdirp(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name), d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
function slugify(s) {
  return String(s)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

// ---------- contenu ----------
const settings = readJSON(path.join(CONTENT, 'settings.json'));
const categories = readJSON(path.join(CONTENT, 'categories.json'));
const imagesMeta = readJSON(path.join(CONTENT, 'images-meta.json'));
const projectsDir = path.join(CONTENT, 'projects');
const projects = fs.readdirSync(projectsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJSON(path.join(projectsDir, f)));

function setting(key) { return settings[key] || ''; }
/** Normalise une valeur d'image venant de Pages CMS ("/images/x.jpg",
 *  "images/x.jpg" ou juste "x.jpg") vers le simple nom de fichier. */
function baseFile(file) {
  if (!file) return '';
  return String(file).replace(/^\/?images\//, '');
}
function imgWH(file) {
  const f = baseFile(file);
  if (!f) return [4, 3];
  const m = imagesMeta[f];
  return m ? m : [4, 3];
}
function imgSrc(file) {
  const f = baseFile(file);
  return f ? '/images/' + f : '';
}
function projectUrl(p) { return '/projet/' + p.slug + '/'; }
function categoryUrl(cat) { return '/categorie/' + cat.key + '/'; }

// ---------- ordre des catégories (identique au site d'origine) ----------
function orderedCategories() {
  const preferred = ['extensions', 'renovations', 'collectifs', 'etudes-urbaines'];
  const byKey = {};
  categories.forEach((c) => { byKey[c.key] = c; });
  const ordered = [];
  preferred.forEach((k) => { if (byKey[k]) { ordered.push(byKey[k]); delete byKey[k]; } });
  Object.values(byKey).forEach((c) => ordered.push(c));
  return ordered;
}

// ---------- score de contenu (pour faire remonter les fiches les plus riches) ----------
function contentScore(p) {
  let score = 0;
  if (Array.isArray(p.gallery)) score += p.gallery.length * 3;
  if (Array.isArray(p.schemas)) score += p.schemas.length;
  if (Array.isArray(p.plans)) score += p.plans.length;
  return score;
}

// ---------- masonry (répartition en 3 colonnes équilibrées) ----------
function estimatedTileHeight(p) {
  const tileFile = p.tile_file || (p.gallery && p.gallery[0] && p.gallery[0].file);
  if (!tileFile) return 1.0 + 0.28;
  const [tw, th] = imgWH(tileFile);
  const ratio = Math.max(0.7, Math.min(1.6, tw / Math.max(1, th)));
  return 1.0 / ratio;
}
function buildMasonry(list, cols = 3) {
  const heights = new Array(cols).fill(0);
  const columns = Array.from({ length: cols }, () => []);
  list.forEach((p) => {
    let minI = 0;
    for (let i = 1; i < cols; i++) if (heights[i] < heights[minI]) minI = i;
    columns[minI].push(p);
    heights[minI] += estimatedTileHeight(p) + 0.06;
  });
  return columns;
}
function hasOrdre(p) { return typeof p.ordre === 'number' && !Number.isNaN(p.ordre); }
function sortedByContent(list) {
  const ordered = list.filter(hasOrdre).sort((a, b) => a.ordre - b.ordre);
  const rest = list.filter((p) => !hasOrdre(p)).sort((a, b) => contentScore(b) - contentScore(a));
  return [...ordered, ...rest];
}
// Ordre canonique des projets (identique à l'ordre affiché sur la page
// d'accueil) — sert aussi à déterminer le « projet suivant » sur chaque fiche.
const homepageOrder = sortedByContent(projects);

// ---------- fragments HTML ----------
function projectCard(p) {
  const span = p.span || 'md';
  const loc = p.commune ? p.commune + ' — ' + p.categorie_texte : p.categorie_texte;
  const catsAttr = (p.cats || []).join(' ');
  const tileFile = p.tile_file || (p.gallery && p.gallery[0] && p.gallery[0].file);

  if (!tileFile) {
    return `<a class="tile tile--${esc(span)} tile--text" href="${projectUrl(p)}" data-cat="${esc(catsAttr)}">
  <div class="tile-text-body">
    <span class="tile-text-code mono">${esc(p.code)}</span>
    <span class="tile-text-name">${esc(p.name)}</span>
    <span class="tile-text-loc">${esc(loc)}</span>
    <span class="tile-text-note">Photos à venir</span>
  </div>
</a>`;
  }
  const [tw, th] = imgWH(tileFile);
  const ratio = Math.max(0.7, Math.min(1.6, tw / Math.max(1, th))).toFixed(3);
  return `<a class="tile tile--${esc(span)}" href="${projectUrl(p)}" data-cat="${esc(catsAttr)}">
  <div class="tile-frame" style="aspect-ratio: ${ratio}">
    <img src="${imgSrc(tileFile)}" alt="${esc(p.name)}" loading="lazy">
    <span class="tile-tick tile-tick--tl"></span>
    <span class="tile-tick tile-tick--br"></span>
  </div>
  <div class="tile-cap">
    <span class="tile-code">${esc(p.code)}</span>
    <span class="tile-name">${esc(p.name)}</span>
    <span class="tile-loc">${esc(loc)}</span>
  </div>
</a>`;
}

function categoryTile(cat) {
  return `<a class="cat" href="${categoryUrl(cat)}">
  <div class="cat-frame" style="aspect-ratio: 0.75"><img src="${imgSrc(cat.file)}" alt="${esc(cat.label)}" loading="lazy"></div>
  <h3>${esc(cat.label)}</h3>
</a>`;
}

function specsHtml(specs) {
  return (specs || [])
    .filter((r) => r.label || r.value)
    .map((r) => `<div class="spec-row"><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`)
    .join('\n');
}

function galItem(file, alt, featured, ratioOverride, fit, noBorder) {
  if (!file) return '';
  const [w, h] = imgWH(file);
  const ratio = ratioOverride ? ratioOverride : `${w}/${h}`;
  const cls = 'gal-item' + (featured ? ' gal-item--wide' : '') + (noBorder ? ' gal-item--flat' : '');
  const fitStyle = fit === 'contain' ? ' object-fit:contain; background:#fff;' : '';
  return `<div class="${cls}"><img src="${imgSrc(file)}" alt="${esc(alt)}" loading="lazy" style="aspect-ratio:${ratio};${fitStyle}"></div>`;
}

function planItem(file, label, maxWidth) {
  if (!file) return '';
  const [w, h] = imgWH(file);
  const wrap = maxWidth ? ` style="max-width:${maxWidth}px; margin:0 auto"` : '';
  return `<figure class="plan-item"${wrap}><img src="${imgSrc(file)}" alt="${esc(label)}" loading="lazy" style="aspect-ratio:${w}/${h}"><figcaption>${esc(label)}</figcaption></figure>`;
}

function schemaItem(file, label, wide, caption, maxWidth) {
  if (!file) return '';
  const [w, h] = imgWH(file);
  const cls = wide ? 'schema-item schema-item--wide' : 'schema-item';
  const wrap = maxWidth ? ` style="max-width:${maxWidth}px; margin:0 auto"` : '';
  const cap = caption ? `<figcaption>${esc(label)}</figcaption>` : '';
  return `<figure class="${cls}"${wrap}><img src="${imgSrc(file)}" alt="${esc(label)}" loading="lazy" style="aspect-ratio:${w}/${h}">${cap}</figure>`;
}

/** Bloc galerie / schémas / plans complet d'une fiche projet. */
function projectMediaHtml(p) {
  // --- Galerie ---
  const gallery = p.gallery || [];
  let gal = '';
  if (gallery.length) {
    const forceWide = gallery.length === 1;
    const imgs = gallery.map((g) => galItem(g.file, p.name, forceWide || !!g.featured, g.ratio, g.fit, !!g.no_border)).join('');
    const galCls = 'proj-gallery' + (p.gallery_flat ? ' proj-gallery--flat' : '');
    gal = `<div class="${galCls}">${imgs}</div>`;
  }

  // --- Schémas ---
  const schemasRaw = p.schemas || [];
  const layout = p.schemas_layout;
  let schemas = '';

  if (schemasRaw.length && layout === 'side') {
    // Largeur fixe des petits schémas empilés à gauche ; la grande image à
    // droite est mise à une hauteur EXACTE égale à la somme de leurs
    // hauteurs (+ l'espacement), pour que les deux colonnes s'alignent.
    const smallWidth = p.schemas_side_small_width || 150;
    const stackGap = 10; // doit correspondre à .schemas-side-stack { gap: 10px }
    let totalH = 0, n = 0, stack = '';
    schemasRaw.forEach((s) => {
      if (!s.file) return;
      const [w, h] = imgWH(s.file);
      const itemH = w ? Math.round(h * (smallWidth / w)) : h;
      totalH += itemH; n++;
      stack += `<figure class="schema-item" style="width:${smallWidth}px"><img src="${imgSrc(s.file)}" alt="${esc(s.label)}" loading="lazy" style="width:100%; height:auto; display:block"></figure>`;
    });
    if (n > 1) totalH += stackGap * (n - 1);
    const sideFile = p.schemas_side_file;
    schemas = `<div class="schemas-section"><h2 class="plans-heading">Principe</h2><div class="schemas-side"><div class="schemas-side-stack">${stack}</div><figure class="schemas-side-big"><img src="${imgSrc(sideFile)}" alt="${esc(p.name)}" loading="lazy" style="height:${totalH}px; width:auto; max-width:100%; object-fit:contain"></figure></div></div>`;
  } else if (schemasRaw.length && layout === 'aligned') {
    const height = p.schemas_align_height || 380;
    const hideCaption = !!p.schemas_hide_caption;
    const cells = schemasRaw.map((s) => {
      if (!s.file) return '';
      const [w, h] = imgWH(s.file);
      const cap = hideCaption ? '' : `<figcaption>${esc(s.label)}</figcaption>`;
      return `<figure class="schema-item schema-item--aligned"><img src="${imgSrc(s.file)}" alt="${esc(s.label)}" loading="lazy" style="aspect-ratio:${w}/${h}; height:${height}px">${cap}</figure>`;
    }).join('');
    schemas = `<div class="schemas-section"><h2 class="plans-heading">Principe</h2><div class="schemas-grid schemas-grid--aligned">${cells}</div></div>`;
  } else if (schemasRaw.length) {
    const compact = layout === 'compact';
    const flat = layout === 'flat';
    const hideCaption = !!p.schemas_hide_caption;
    const items = schemasRaw.map((s) => s.file ? schemaItem(s.file, s.label, false, !(compact || flat) && !hideCaption, s.max_width) : '').join('');
    let gridCls = 'schemas-grid';
    if (compact) gridCls += ' schemas-grid--compact';
    else if (flat) gridCls += ' schemas-grid--flat';
    schemas = `<div class="schemas-section"><h2 class="plans-heading">Principe</h2><div class="${gridCls}">${items}</div></div>`;
  }

  // --- Plans ---
  const plansRaw = p.plans || [];
  let plans = '';
  if (plansRaw.length) {
    const items = plansRaw.map((pl) => pl.file ? planItem(pl.file, pl.label, pl.max_width) : '').join('');
    const gridCls = p.plans_layout === 'row' ? 'plans-grid plans-grid--row' : 'plans-grid';
    plans = `<div class="plans-section"><h2 class="plans-heading">Plans</h2><div class="${gridCls}">${items}</div></div>`;
  }

  const afterGallery = !!p.schemas_after_gallery;
  const first = afterGallery ? gal : schemas;
  const second = afterGallery ? schemas : gal;
  return `<div class="proj-media">${first}${second}${plans}</div>`;
}

// ---------- gabarit de page (header/footer communs) ----------
function page(title, bodyHtml, opts = {}) {
  const logoMark = setting('logo_mark_file');
  const logoWordmark = setting('logo_wordmark_file');
  const insta = setting('instagram_url');
  const phone = setting('phone');
  const siteName = setting('site_name') || 'Fernand Yvon Architectes';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800&family=Open+Sans:wght@400;600;700;800&family=IBM+Plex+Mono:wght@500;600;700&display=swap">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<nav class="site-sidebar" id="site-sidebar">
  <div>
    <div class="brand-block">
      <a class="brand" href="/" aria-label="${esc(siteName)} — accueil">
        ${logoMark ? `<img class="brand-icon" src="${imgSrc(logoMark)}" alt="">` : ''}
        ${logoWordmark ? `<img class="wordmark-img" src="${imgSrc(logoWordmark)}" alt="${esc(siteName)}">` : `<span class="wordmark-text">${esc(siteName)}</span>`}
      </a>
      <button class="menu-toggle" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="site-nav">
        <span class="menu-toggle-bar"></span>
        <span class="menu-toggle-bar"></span>
        <span class="menu-toggle-bar"></span>
      </button>
    </div>
    <div class="site-nav" id="site-nav">
      <a class="nav-link" href="/">Accueil</a>
      <a class="nav-link" href="/#realisations">Projets</a>
      <a class="nav-link" href="/#agence">Agence</a>
      ${insta ? `<a class="nav-icon" href="${esc(insta)}" target="_blank" rel="noopener" aria-label="Instagram">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="currentColor" stroke-width="1.6"/>
          <circle cx="12" cy="12" r="4.4" stroke="currentColor" stroke-width="1.6"/>
          <circle cx="17.3" cy="6.7" r="1.15" fill="currentColor"/>
        </svg>
      </a>` : ''}
      <a class="nav-link nav-link--solid" href="/#contact">Nous contacter</a>
    </div>
  </div>
  <div class="sidebar-foot">
    <p class="sidebar-foot-name">${esc(siteName)}</p>
    <p>${esc(setting('address_line1'))}<br>${esc(setting('address_line2'))}</p>
    <p><a href="mailto:${esc(setting('email'))}">${esc(setting('email'))}</a></p>
    ${phone ? `<p><a href="tel:${esc(phone.replace(/\s+/g, ''))}">${esc(phone)}</a></p>` : ''}
  </div>
</nav>
<main class="site-main">
${bodyHtml}
</main>
<footer class="site-footer" id="contact">
  <div class="shell">
    <div class="footer-grid">
      <div class="footer-block">
        <p class="eyebrow">Contact</p>
        <a href="mailto:${esc(setting('email'))}">${esc(setting('email'))}</a>
      </div>
      <div class="footer-block">
        <p class="eyebrow">Suivre</p>
        <p>${insta ? `<a href="${esc(insta)}" target="_blank" rel="noopener">Instagram</a>` : ''}</p>
      </div>
    </div>
    <p class="footer-note">${esc(setting('footer_note'))}</p>
    ${setting('contact_plan_file') ? `<div class="footer-plan"><img src="${imgSrc(setting('contact_plan_file'))}" alt="Plan de situation — ${esc(setting('address_line1'))} ${esc(setting('address_line2'))}" loading="lazy"></div>` : ''}
  </div>
</footer>
<script src="/main.js"></script>
</body>
</html>
`;
}

// ---------- page d'accueil ----------
function renderGrid(list) {
  const columns = buildMasonry(sortedByContent(list), 3);
  return `<div class="grid">${columns.map((col) => `<div class="grid-col">${col.map(projectCard).join('')}</div>`).join('')}</div>`;
}

function homeBody() {
  const cats = orderedCategories();
  return `<section id="view-home">
  <div class="shell categories" id="categories-row">
    ${cats.map(categoryTile).join('\n    ')}
  </div>
  <div class="shell" id="realisations">
    ${renderGrid(projects)}
  </div>
  <div class="shell about" id="agence">
    <div class="about-top"><h2>L'agence</h2></div>
    <div class="about-rows">
      <div class="about-row"><div>
        <h3>${esc(setting('about1_title'))}</h3>
        <p>${esc(setting('about1_text'))}</p>
      </div></div>
      <div class="about-row"><div>
        <h3>${esc(setting('about2_title'))}</h3>
        <p>${esc(setting('about2_text'))}</p>
      </div></div>
      <div class="about-row"><div>
        <h3>${esc(setting('about3_title'))}</h3>
        <p>${esc(setting('about3_text'))}</p>
        ${(settings.about3_list || []).length ? `<ul class="about-list">${(settings.about3_list || []).map((li) => `<li>${esc(li)}</li>`).join('')}</ul>` : ''}
      </div></div>
      <div class="about-row"><div>
        <h3>${esc(setting('about4_title'))}</h3>
        <p>${esc(setting('about4_text'))}</p>
      </div></div>
    </div>
    ${setting('tagline') ? `<p class="about-tagline">« ${esc(setting('tagline'))} »</p>` : ''}
  </div>
</section>`;
}

// ---------- pages catégorie ----------
function categoryBody(cat) {
  const list = projects.filter((p) => (p.cats || []).includes(cat.key));
  return `<section id="view-home">
  <div class="shell cat-filter-bar" id="cat-filter-bar">
    <a class="back-link" href="/">← Tous les projets</a>
    <h1 class="cat-view-title">${esc(cat.label)}</h1>
    ${list.length ? '' : '<p class="cat-empty">Aucun projet en ligne pour le moment dans cette catégorie.</p>'}
  </div>
  ${list.length ? `<div class="shell" id="realisations">${renderGrid(list)}</div>` : ''}
</section>`;
}

/** Lien vers le projet suivant (dans l'ordre de la page d'accueil), pour
 *  naviguer de projet en projet sans repasser par l'accueil. */
function nextProjectHtml(p) {
  const order = homepageOrder;
  if (order.length < 2) return '';
  const idx = order.findIndex((x) => x.slug === p.slug);
  if (idx === -1) return '';
  const next = order[(idx + 1) % order.length];
  return `<div class="proj-next">
    <a class="proj-next-link" href="${projectUrl(next)}">
      <span class="proj-next-label">Projet suivant</span>
      <span class="proj-next-name">${esc(next.name)} →</span>
    </a>
  </div>`;
}

// ---------- page projet ----------
function projectBody(p) {
  return `<article class="proj" data-view="${esc(p.slug)}">
  <div class="proj-body">
    <div class="proj-intro-block">
      <a class="back-link" href="/#realisations">← Réalisations</a>
      <p class="proj-eyebrow">${esc(p.categorie_texte)}${p.code ? ' · ' + esc(p.code) : ''}</p>
      <h1>${esc(p.name)}</h1>
      ${p.intro ? `<p class="proj-intro">${esc(p.intro)}</p>` : ''}
      <dl class="specs">
        ${specsHtml(p.specs)}
      </dl>
    </div>
    ${projectMediaHtml(p)}
    ${nextProjectHtml(p)}
  </div>
</article>`;
}

/** Rassemble tous les noms de fichiers image référencés par le contenu
 *  (galeries, schémas, plans, vignettes, logos, catégories...). */
function referencedImageFiles() {
  const names = new Set(Object.keys(imagesMeta));
  if (settings.logo_mark_file) names.add(baseFile(settings.logo_mark_file));
  if (settings.logo_wordmark_file) names.add(baseFile(settings.logo_wordmark_file));
  if (settings.contact_plan_file) names.add(baseFile(settings.contact_plan_file));
  categories.forEach((c) => { if (c.file) names.add(baseFile(c.file)); });
  projects.forEach((p) => {
    if (p.tile_file) names.add(baseFile(p.tile_file));
    (p.gallery || []).forEach((g) => { if (g.file) names.add(baseFile(g.file)); });
    (p.schemas || []).forEach((s) => { if (s.file) names.add(baseFile(s.file)); });
    (p.plans || []).forEach((pl) => { if (pl.file) names.add(baseFile(pl.file)); });
    if (p.schemas_side_file) names.add(baseFile(p.schemas_side_file));
  });
  names.delete('');
  return [...names];
}

/** Copie chaque image référencée vers dist/images/, en la cherchant soit
 *  dans un dossier images/ à la racine du dépôt, soit directement à la
 *  racine du dépôt (au cas où l'upload GitHub n'a pas conservé le
 *  sous-dossier) — pour que le site fonctionne quel que soit l'endroit où
 *  les photos ont atterri. */
function copyReferencedImages() {
  mkdirp(path.join(DIST, 'images'));
  let missing = 0;
  referencedImageFiles().forEach((file) => {
    const candidates = [
      path.join(ROOT, 'images', file),
      path.join(ROOT, file),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) {
      fs.copyFileSync(found, path.join(DIST, 'images', file));
    } else {
      missing++;
      console.warn(`Image introuvable (ni dans images/, ni à la racine) : ${file}`);
    }
  });
  console.log(`${referencedImageFiles().length - missing} image(s) copiée(s)${missing ? `, ${missing} manquante(s)` : ''}.`);
}

// ---------- construction ----------
function build() {
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  mkdirp(DIST);

  // Assets statiques
  copyReferencedImages();
  fs.copyFileSync(path.join(SRC, 'style.css'), path.join(DIST, 'style.css'));
  fs.copyFileSync(path.join(SRC, 'main.js'), path.join(DIST, 'main.js'));

  // Accueil
  writeFile(path.join(DIST, 'index.html'), page(setting('site_name') || 'Fernand Yvon Architectes', homeBody()));

  // Catégories
  orderedCategories().forEach((cat) => {
    writeFile(path.join(DIST, 'categorie', cat.key, 'index.html'), page(`${cat.label} — Fernand Yvon Architectes`, categoryBody(cat)));
  });

  // Projets
  projects.forEach((p) => {
    writeFile(path.join(DIST, 'projet', p.slug, 'index.html'), page(`${p.name} — Fernand Yvon Architectes`, projectBody(p)));
  });

  // Page 404 simple
  writeFile(path.join(DIST, '404.html'), page('Page introuvable — Fernand Yvon Architectes', `<section class="shell" style="padding:120px 0; text-align:center;"><h1>Page introuvable</h1><p><a class="back-link" href="/">← Retour à l'accueil</a></p></section>`));

  console.log(`Site généré dans dist/ (${projects.length} projets, ${orderedCategories().length} catégories).`);
}

build();
