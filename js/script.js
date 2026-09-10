"use strict";

// ---------- state ----------
let images = [];       // {imgEl}
let selectedIndex = -1;
let accountFontFamily = null; // set once the custom font finishes loading (or stays null = fallback)
let carouselBadgeImg = null;  // loaded once from assets/icons/carousel-badge.png

const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

const els = {
  igLink: document.getElementById('igLink'),
  fetchBtn: document.getElementById('fetchBtn'),
  fetchStatus: document.getElementById('fetchStatus'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  gridStep: document.getElementById('gridStep'),
  thumbGrid: document.getElementById('thumbGrid'),
  accountName: document.getElementById('accountName'),
  carouselToggle: document.getElementById('carouselToggle'),
  generateBtn: document.getElementById('generateBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  previewPlaceholder: document.getElementById('previewPlaceholder'),
};

// ---------- asset preloading ----------
// Custom font for the account-name text. If none of the files below exist yet
// in assets/fonts/, this simply fails silently and render() falls back to the
// system font stack — nothing breaks either way.
// NOTE: unlike a CSS @font-face url() — which resolves relative to the .css
// file's own location — a relative URL passed to the FontFace API resolves
// relative to the HTML document (index.html, at the project root). So paths
// here must NOT start with "../" the way the CSS ones do.
(function loadAccountFont(){
  if (!('FontFace' in window)) return;
  const candidates = [
    'assets/fonts/SF-Pro-Semibold.woff2',
    'assets/fonts/SF-Pro-Semibold.otf',
    'assets/fonts/SF-Pro-Semibold.ttf',
  ];
  (async () => {
    for (const path of candidates){
      try {
        const font = new FontFace('AccountNameFont', `url(${path})`, { weight: '600' });
        const loaded = await font.load();
        document.fonts.add(loaded);
        accountFontFamily = 'AccountNameFont';
        return; // stop at the first file that actually exists and loads
      } catch (e){
        continue; // that extension isn't there — try the next one
      }
    }
    accountFontFamily = null; // none of the candidate files were found
  })();
})();

// Carousel badge image (extracted from the original PSD by default).
// Swap assets/icons/carousel-badge.png with your own file any time —
// this just loads whatever is at that path.
(function loadCarouselBadge(){
  const img = new Image();
  img.crossOrigin = 'anonymous'; // avoids tainting the canvas once this is served over http(s)
  img.onload = () => { carouselBadgeImg = img; };
  img.onerror = () => { carouselBadgeImg = null; };
  img.src = 'assets/icons/carousel-badge.png';
})();

// Opening this file locally via double-click (file:// URL) makes Chrome treat
// every local file as its own opaque origin — even images in the same folder
// (like the carousel badge) can then taint the canvas on export, regardless
// of what photo you picked yourself. This has nothing to do with GitHub
// Pages: once actually hosted there (a real https origin), this specific
// issue goes away on its own. Flag it up front so it's obvious what's going on.
if (location.protocol === 'file:'){
  window.addEventListener('DOMContentLoaded', () => {
    setStatus('Stai aprendo il file in locale (file://): alcuni browser bloccano l\'export del PNG in questa modalità per via delle immagini in assets/. Per testare in locale senza problemi, avvia un mini server (es. "python3 -m http.server" nella cartella del progetto) e apri http://localhost:8000 — una volta pubblicato su GitHub Pages funzionerà comunque normalmente.', 'err');
  });
}

// ---------- helpers ----------
function setStatus(msg, kind){
  els.fetchStatus.textContent = msg;
  els.fetchStatus.className = 'status' + (kind ? ' ' + kind : '');
}

function loadImageFromSrc(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// For images coming from a remote URL (auto-fetch results), fetch the bytes
// ourselves through the CORS proxy and turn them into a local blob: URL,
// instead of pointing an <img crossorigin> straight at the CDN. Instagram's
// CDN doesn't reliably send CORS headers, so loading it directly sometimes
// taints the canvas and silently breaks the PNG export ("Scarica" doing
// nothing) — this sidesteps that: once it's a local blob, the canvas is
// never tainted, regardless of what the original server sent.
async function loadRemoteImageViaProxy(url){
  const res = await fetch(CORS_PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  return loadImageFromSrc(objectUrl); // no crossOrigin needed/relevant for a local blob: URL
}

function addImage(imgEl){
  images.push({ imgEl });
  renderGrid();
}

function renderGrid(){
  els.thumbGrid.innerHTML = '';
  if (images.length === 0){
    els.gridStep.style.display = 'none';
    updateGenerateEnabled();
    return;
  }
  els.gridStep.style.display = 'block';
  images.forEach((entry, i) => {
    const div = document.createElement('div');
    div.className = 'thumb' + (i === selectedIndex ? ' selected' : '');
    const im = document.createElement('img');
    im.src = entry.imgEl.src;
    div.appendChild(im);
    const rm = document.createElement('div');
    rm.className = 'remove';
    rm.textContent = '×';
    rm.onclick = (e) => {
      e.stopPropagation();
      images.splice(i, 1);
      if (selectedIndex === i) selectedIndex = -1;
      else if (selectedIndex > i) selectedIndex--;
      renderGrid();
    };
    div.appendChild(rm);
    div.onclick = () => { selectedIndex = i; renderGrid(); };
    els.thumbGrid.appendChild(div);
  });
  // auto-toggle carousel based on how many photos are loaded; still user-editable
  els.carouselToggle.checked = images.length > 1;
  updateGenerateEnabled();
}

function updateGenerateEnabled(){
  els.generateBtn.disabled = !(selectedIndex >= 0 && images[selectedIndex]);
}

// ---------- manual upload ----------
els.dropzone.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

['dragenter', 'dragover'].forEach(evt => {
  els.dropzone.addEventListener(evt, (e) => { e.preventDefault(); els.dropzone.classList.add('drag'); });
});
['dragleave', 'drop'].forEach(evt => {
  els.dropzone.addEventListener(evt, (e) => { e.preventDefault(); els.dropzone.classList.remove('drag'); });
});
els.dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));

function handleFiles(fileList){
  Array.from(fileList).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      loadImageFromSrc(e.target.result).then(img => {
        addImage(img);
        if (selectedIndex === -1) selectedIndex = images.length - 1;
        renderGrid();
      });
    };
    reader.readAsDataURL(file);
  });
}

// ---------- automatic fetch (best-effort, experimental) ----------
// These downloader sites are built for humans, not for scripted calls: this
// routes the request through a public CORS proxy and scrapes the resulting
// HTML for direct image URLs / og:image tags. It WILL break if any of these
// services changes its markup or blocks the proxy — that's expected, that's
// why manual drag & drop above always works regardless of this succeeding.
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

async function proxiedFetch(url){
  const res = await fetch(CORS_PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

function extractImageUrlsFromHtml(html){
  const urls = new Set();
  const ogRe = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
  let m;
  while ((m = ogRe.exec(html))) urls.add(m[1]);
  const imgRe = /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  while ((m = imgRe.exec(html))) {
    if (/cdninstagram|fbcdn|scontent|instagram/i.test(m[1])) urls.add(m[1]);
  }
  // embed pages sometimes set the image as a CSS background instead of <img src>
  const bgRe = /background-image:\s*url\(['"]?([^'")]+)['"]?\)/gi;
  while ((m = bgRe.exec(html))) {
    if (/cdninstagram|fbcdn|scontent|instagram/i.test(m[1])) urls.add(m[1]);
  }
  return Array.from(urls);
}

function extractUsername(html, igUrl){
  // Instagram's own pages embed the owner username as JSON somewhere in the markup —
  // that's more reliable than an @mention, which could just be someone tagged in the caption.
  let m = html.match(/"username":"([a-zA-Z0-9._]+)"/);
  if (m) return m[1];
  m = html.match(/@([a-zA-Z0-9._]+)/);
  if (m) return m[1];
  m = igUrl.match(/instagram\.com\/([a-zA-Z0-9._]+)\/p\//);
  if (m) return m[1];
  return '';
}

function extractShortcode(igUrl){
  const m = igUrl.match(/instagram\.com\/(?:[^/]+\/)?(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? { type: m[1], code: m[2] } : null;
}

// Primary attempt: Instagram's own (undocumented but long-stable) "embed" page,
// the same markup used by official "embed this post" widgets around the web.
// More robust than third-party scrapers because it's Instagram's own HTML —
// but it reliably exposes only the COVER photo of a carousel, not every slide.
// A CORS proxy is still required either way, since instagram.com doesn't allow
// cross-origin requests from an arbitrary GitHub Pages domain.
async function tryInstagramEmbed(igUrl){
  const sc = extractShortcode(igUrl);
  if (!sc) return null;
  const embedUrl = `https://www.instagram.com/${sc.type}/${sc.code}/embed/captioned/`;
  try {
    const html = await proxiedFetch(embedUrl);
    const urls = extractImageUrlsFromHtml(html);
    if (!urls.length) return null;
    return { urls, username: extractUsername(html, igUrl), coverOnly: true };
  } catch (e){
    return null;
  }
}

// Secondary attempt (fallback): third-party downloader sites. Kept only as a
// second try, since they're less stable than Instagram's own markup, but they
// occasionally still surface the full carousel when they're working.
async function tryThirdPartyDownloaders(igUrl){
  const targets = [
    'https://fastdl.app/photo?url=' + encodeURIComponent(igUrl),
    'https://inflact.com/instagram-downloader/photo/?url=' + encodeURIComponent(igUrl),
    'https://saveclip.app/en8/instagram-photo-download?url=' + encodeURIComponent(igUrl),
  ];
  for (const target of targets){
    try {
      const html = await proxiedFetch(target);
      const urls = extractImageUrlsFromHtml(html);
      if (urls.length) return { urls, username: extractUsername(html, igUrl), coverOnly: false };
    } catch (e){
      continue; // this service failed or was blocked — try the next one
    }
  }
  return null;
}

async function tryAutoFetch(igUrl){
  const embedResult = await tryInstagramEmbed(igUrl);
  if (embedResult) return embedResult;
  return tryThirdPartyDownloaders(igUrl);
}

els.fetchBtn.addEventListener('click', async () => {
  const link = els.igLink.value.trim();
  if (!link){ setStatus('Incolla prima un link del post.', 'err'); return; }
  setStatus('Tentativo di recupero automatico in corso…');
  els.fetchBtn.disabled = true;
  try {
    const result = await tryAutoFetch(link);
    if (!result){
      setStatus('Fetch automatico non riuscito (i siti bloccano lo scraping o hanno cambiato pagina).\nUsa il caricamento manuale qui sotto: apri il link su uno di questi servizi e trascina l\'immagine scaricata nella zona di upload.', 'err');
      return;
    }
    let loaded = 0;
    for (const u of result.urls){
      try {
        const img = await loadRemoteImageViaProxy(u);
        addImage(img);
        loaded++;
      } catch (e){ /* single image failed to load (hotlink protection etc), skip it */ }
    }
    if (loaded === 0){
      setStatus('Trovate delle URL ma non è stato possibile caricarle (hotlink protection). Usa il caricamento manuale.', 'err');
      return;
    }
    if (selectedIndex === -1) selectedIndex = images.length - loaded;
    renderGrid();
    if (result.username && !els.accountName.value) els.accountName.value = result.username;
    if (result.coverOnly){
      setStatus('Trovata la copertina del post (' + loaded + ' immagine). Se è un carousel con altre foto, quelle vanno caricate a mano qui sotto — Instagram non le espone senza login.', 'ok');
    } else {
      setStatus('Trovate ' + loaded + ' immagine/i. Controlla la selezione e il nome account.', 'ok');
    }
  } catch (e){
    setStatus('Errore imprevisto durante il fetch. Usa il caricamento manuale.', 'err');
  } finally {
    els.fetchBtn.disabled = false;
  }
});

// ---------- rendering ----------
function drawCoverImage(ctx, img, x, y, w, h){
  const ir = img.width / img.height;
  const r = w / h;
  let sx, sy, sw, sh;
  if (ir > r){
    sh = img.height;
    sw = sh * r;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / r;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundedRectPath(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Carousel badge: drawn from assets/icons/carousel-badge.png (real asset,
// defaults to the icon extracted straight from the original PSD layer).
// If that image failed to load for any reason, falls back to a plain
// rounded dark pill so the layout doesn't visibly break.
function drawCarouselBadge(ctx, centerX, centerY){
  if (carouselBadgeImg){
    const w = carouselBadgeImg.width;
    const h = carouselBadgeImg.height;
    ctx.save();
    //ctx.shadowColor = 'rgba(0,0,0,0.35)';
    //ctx.shadowBlur = 6;
    ctx.drawImage(carouselBadgeImg, centerX - w / 2, centerY - h / 2, w, h);
    ctx.restore();
    return;
  }
  ctx.save();
  roundedRectPath(ctx, centerX - 17, centerY - 17, 34, 34, 9);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  ctx.restore();
}

function render(){
  const entry = images[selectedIndex];
  if (!entry) return;
  const img = entry.imgEl;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // BG layer: same photo, scaled to cover the full canvas, blurred
  ctx.save();
  ctx.filter = 'blur(38px) saturate(1.05)';
  drawCoverImage(ctx, img, -60, -60, canvas.width + 120, canvas.height + 120);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // photo card geometry (from PSD: left 65, top 367, w 949, h 1186, radius ~32)
  const cardX = 65, cardY = 367, cardW = 949, cardH = 1186, radius = 32;

  ctx.save();
  //ctx.shadowColor = 'rgba(0,0,0,0.45)';
  //ctx.shadowBlur = 40;
  //ctx.shadowOffsetY = 18;
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();
  drawCoverImage(ctx, img, cardX, cardY, cardW, cardH);
  ctx.restore();

  // carousel badge, top-right inside the card (PSD layer center ≈ 957, 423)
  if (els.carouselToggle.checked){
    drawCarouselBadge(ctx, 957, 423);
  }

  // account name
  const name = els.accountName.value.trim();
  if (name){
    ctx.save();
    const family = accountFontFamily
      ? `"${accountFontFamily}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
      : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.font = `600 36px ${family}`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    //ctx.shadowColor = 'rgba(0,0,0,0.35)';
    //ctx.shadowBlur = 10;
    const text = '@' + name.replace(/^@/, '');
    let x = 89;
    const y = 1596;
    for (const ch of text){
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + 0.6;
    }
    ctx.restore();
  }

  canvas.style.display = 'block';
  els.previewPlaceholder.style.display = 'none';
  els.downloadBtn.disabled = false;
}

els.generateBtn.addEventListener('click', render);

els.downloadBtn.addEventListener('click', () => {
  // Using toDataURL() instead of toBlob()+createObjectURL(): it's synchronous,
  // doesn't depend on Blob URL lifetime/revocation timing, and is far more
  // reliable when the page is opened locally as a file:// URL (where blob:
  // downloads triggered by a synthetic click can silently fail in some
  // browsers) as well as once it's actually served over GitHub Pages.
  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch (e){
    const hint = location.protocol === 'file:'
      ? 'Probabilmente perché stai aprendo il file in locale (file://): avvia un mini server (es. "python3 -m http.server") e riprova da http://localhost — su GitHub Pages funzionerà normalmente.'
      : 'Prova a ricaricare la foto tramite il caricamento manuale.';
    setStatus('Impossibile generare il PNG: il canvas contiene un\'immagine non accessibile per l\'export. ' + hint, 'err');
    return;
  }
  const name = els.accountName.value.trim().replace(/^@/, '') || 'story';
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'ig-story-' + name + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
});

els.accountName.addEventListener('input', () => { if (selectedIndex >= 0) render(); });
els.carouselToggle.addEventListener('change', () => { if (selectedIndex >= 0) render(); });
