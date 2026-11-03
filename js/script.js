"use strict";

// ---------- state ----------
let images = [];       // {imgEl}
let selectedIndex = -1;
let accountFontFamily = null; // set once the custom font finishes loading (or stays null = fallback)
let carouselBadgeImg = null;  // loaded once from assets/icons/carousel-badge.png

const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

const els = {
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  gridStep: document.getElementById('gridStep'),
  thumbGrid: document.getElementById('thumbGrid'),
  igLink: document.getElementById('igLink'),
  fetchUsernameBtn: document.getElementById('fetchUsernameBtn'),
  fetchStatus: document.getElementById('fetchStatus'),
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
// The old loader requested it with crossOrigin="anonymous" and, on any error,
// silently gave up — which is why a dark placeholder square was drawn instead
// of the real icon. Now it tries, in order: each candidate file name below
// (so a replacement saved as .png/.webp/.svg/.jpg is found too), first as a
// plain same-origin image and then with crossOrigin. If nothing loads, a
// visible message names the exact paths that were tried.
const BADGE_CANDIDATES = [
  'assets/icons/carousel-badge.png',
  'assets/icons/carousel-badge.webp',
  'assets/icons/carousel-badge.svg',
  'assets/icons/carousel-badge.jpg',
  'assets/icons/carousel-badge.jpeg',
];

function tryLoadBadge(path, useCors){
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCors) img.crossOrigin = 'anonymous';
    img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new Error('empty image')));
    img.onerror = () => reject(new Error('not found: ' + path));
    img.src = path;
  });
}

(async function loadCarouselBadge(){
  for (const path of BADGE_CANDIDATES){
    for (const useCors of [false, true]){
      try {
        carouselBadgeImg = await tryLoadBadge(path, useCors);
        // if a story was already generated before the badge finished loading, redraw it
        if (selectedIndex >= 0 && canvas.style.display === 'block') render();
        return;
      } catch (e){ /* try the next variant */ }
    }
  }
  carouselBadgeImg = null;
  console.warn('Carousel badge not found. Tried: ' + BADGE_CANDIDATES.join(', '));
})();

// Opening this file locally via double-click (file:// URL) makes Chrome treat
// every local file as its own opaque origin — even images in the same folder
// (like the carousel badge) can then taint the canvas on export. This has
// nothing to do with GitHub Pages: once actually hosted there (a real https
// origin), this specific issue goes away on its own.
if (location.protocol === 'file:'){
  window.addEventListener('DOMContentLoaded', () => {
    const div = document.createElement('div');
    div.className = 'status err';
    div.style.maxWidth = '380px';
    div.style.margin = '0 auto 20px';
    div.textContent = 'Stai aprendo il file in locale (file://): alcuni browser bloccano l\'export del PNG in questa modalità per via delle immagini in assets/. Per testare in locale senza problemi, avvia un mini server (es. "python3 -m http.server" nella cartella del progetto) e apri http://localhost:8000 — su GitHub Pages funziona normalmente.';
    document.body.insertBefore(div, document.body.firstChild.nextSibling);
  });
}

// ---------- helpers ----------
function loadImageFromSrc(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
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

// ---------- username-only fetch (text only — no image download, no canvas
// tainting risk, much simpler and more reliable than fetching photos) ----------
function setFetchStatus(msg, kind){
  els.fetchStatus.textContent = msg;
  els.fetchStatus.className = 'status' + (kind ? ' ' + kind : '');
}

// Meta's official Instagram oEmbed API, tokenless for public content since
// 15 June 2026 (1,000 requests/hour, no login/app review needed):
// https://developers.facebook.com/docs/instagram-platform/oembed/
// Still needs a CORS proxy since graph.facebook.com doesn't allow requests
// from an arbitrary GitHub Pages origin. Since Nov 2025 Meta stopped
// returning author_name as a separate field, so the username is pulled back
// out of the "html" (embed blockquote) field it still returns — that markup
// ends with "A post shared by Name (@username)", which is what this looks for.
//
// Public CORS proxies are individually flaky, so several are tried in order
// rather than relying on just one.
const CORS_PROXIES = [
  (url) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
  (url) => 'https://corsproxy.io/?url=' + encodeURIComponent(url),
  (url) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url),
];

async function fetchUsernameFromLink(igUrl){
  const endpoint = 'https://graph.facebook.com/v26.0/instagram_oembed?url=' + encodeURIComponent(igUrl);
  let lastError = null;

  for (const buildProxyUrl of CORS_PROXIES){
    let text;
    try {
      const res = await fetch(buildProxyUrl(endpoint), { signal: AbortSignal.timeout(12000) });
      if (!res.ok){
        lastError = 'il proxy ha risposto con HTTP ' + res.status;
        continue; // try the next proxy
      }
      text = await res.text();
    } catch (e){
      lastError = 'proxy irraggiungibile (' + (e.message || e.name || 'errore di rete') + ')';
      continue; // try the next proxy
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e){
      lastError = 'risposta non in formato JSON valido';
      continue; // this proxy returned something unusable — try the next one
    }

    if (data && data.error){
      // graph.facebook.com itself returned an error (e.g. post not public,
      // rate-limited, or the tokenless policy changed) — no point trying
      // another proxy, the API's answer would be the same through any of them
      throw new Error('Instagram/Meta ha risposto con un errore: ' + (data.error.message || JSON.stringify(data.error)));
    }
    if (!data || !data.html){
      lastError = 'risposta senza il campo "html" atteso';
      continue;
    }

    const m = data.html.match(/@([a-zA-Z0-9._]+)/);
    if (!m){
      throw new Error('la risposta è arrivata ma non contiene un nome utente riconoscibile');
    }
    return m[1];
  }

  throw new Error(lastError || 'tutti i proxy CORS disponibili hanno fallito');
}

els.fetchUsernameBtn.addEventListener('click', async () => {
  const link = els.igLink.value.trim();
  if (!link){ setFetchStatus('Incolla prima un link del post.', 'err'); return; }
  setFetchStatus('Recupero il nome utente…');
  els.fetchUsernameBtn.disabled = true;
  try {
    const username = await fetchUsernameFromLink(link);
    els.accountName.value = username;
    if (selectedIndex >= 0) render();
    setFetchStatus('Trovato: @' + username, 'ok');
  } catch (e){
    setFetchStatus('Non recuperato automaticamente: ' + e.message + '. Scrivi il nome account a mano qui sotto.', 'err');
  } finally {
    els.fetchUsernameBtn.disabled = false;
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

// Carousel badge: drawn only from the image in assets/icons/ (no more
// placeholder shape). Scaled to the PSD's badge size (75x70 at 1080px wide)
// keeping the file's own proportions, so any replacement image — whatever its
// resolution — lands at the right size and centered on the same spot.
const BADGE_BOX_W = 75, BADGE_BOX_H = 70;
function drawCarouselBadge(ctx, centerX, centerY){
  if (!carouselBadgeImg) return;
  const nw = carouselBadgeImg.naturalWidth || carouselBadgeImg.width;
  const nh = carouselBadgeImg.naturalHeight || carouselBadgeImg.height;
  const s = Math.min(BADGE_BOX_W / nw, BADGE_BOX_H / nh);
  const w = nw * s, h = nh * s;
  ctx.drawImage(carouselBadgeImg, centerX - w / 2, centerY - h / 2, w, h);
}

function render(){
  const entry = images[selectedIndex];
  if (!entry) return;
  const img = entry.imgEl;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // BG layer: same photo, scaled to cover the full canvas, blurred 70px.
  // The photo is drawn oversized by BG_BLEED on every side so the blur doesn't
  // fade out into transparency at the canvas edges (needs ~2-3x the blur).
  const BG_BLUR = 70, BG_BLEED = 240;
  ctx.save();
  ctx.filter = `blur(${BG_BLUR}px) saturate(1.05)`;
  drawCoverImage(ctx, img, -BG_BLEED, -BG_BLEED, canvas.width + BG_BLEED * 2, canvas.height + BG_BLEED * 2);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Photo card geometry. The card takes the EXACT aspect ratio of the selected
  // photo, so nothing is ever cropped, whatever the ratio (1:1, 4:5, 3:4,
  // landscape, anything). The PSD mockup is a 4:5 card (left 65, top 367,
  // w 949, h 1186, radius ~32), vertically centered on the 1920px canvas.
  // The card is the biggest size that fits inside a 949 x 1300 box (the
  // height cap leaves room for the account name below it): it keeps the
  // 949px width whenever the photo allows, and only for very tall photos does
  // it shrink in width (staying horizontally centered) to respect the cap.
  // The story canvas itself stays 1080x1920, the only size IG stories accept.
  const MAX_CARD_W = 949, MAX_CARD_H = 1300, radius = 32;
  const scale = Math.min(MAX_CARD_W / img.width, MAX_CARD_H / img.height);
  const cardW = Math.round(img.width * scale);
  const cardH = Math.round(img.height * scale);
  const cardX = Math.floor((canvas.width - cardW) / 2);
  const cardY = Math.round(canvas.height / 2 - cardH / 2);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();
  // whole image, no cover-crop: the card already has the photo's own ratio
  ctx.drawImage(img, cardX, cardY, cardW, cardH);
  ctx.restore();

  // carousel badge, top-right inside the card. In the PSD its center sits
  // 57px from the card's right edge and 56px from its top edge, so it's
  // anchored to the card corner and follows it for any card height.
  if (els.carouselToggle.checked){
    drawCarouselBadge(ctx, cardX + cardW - 57, cardY + 56);
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
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    const text = '@' + name.replace(/^@/, '');
    // PSD: text starts 24px right of the card's left edge and 43px below its
    // bottom edge — anchored to the card so it follows any card height
    let x = cardX + 24;
    const y = cardY + cardH + 43;
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
  // toDataURL() rather than toBlob()+createObjectURL(): synchronous, doesn't
  // depend on Blob URL lifetime, and far more reliable both when the page is
  // opened locally as file:// and once served over GitHub Pages.
  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch (e){
    const hint = location.protocol === 'file:'
      ? 'Probabilmente perché stai aprendo il file in locale (file://): avvia un mini server (es. "python3 -m http.server") e riprova da http://localhost — su GitHub Pages funzionerà normalmente.'
      : 'Prova a ricaricare la foto.';
    alert('Impossibile generare il PNG: il canvas contiene un\'immagine non accessibile per l\'export. ' + hint);
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
