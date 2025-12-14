const cachePanelEl = document.getElementById('cache-panel');
const cacheToggleEl = document.getElementById('cache-toggle');
const cacheListEl = document.getElementById('cache-list');
const cacheCountEl = document.getElementById('cache-count');

let cacheOpen = false;
let cacheData = [];

function setCacheOpen(open) {
  cacheOpen = open;
  cachePanelEl.classList.toggle('cache-panel--open', open);
  cacheToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
}

window.updateCacheCountOnly = async function () {
  try {
    const res = await fetch('/api/ytdl/showcache');
    const data = await res.json();
    const count = Array.isArray(data) ? data.length : 0;
    cacheCountEl.textContent = count;
  } catch {
    cacheCountEl.textContent = '0';
  }
};

async function loadCache() {
  try {
    cacheListEl.innerHTML = '<div class="cache-loading">Loading cache…</div>';

    const res = await fetch('/api/ytdl/showcache');
    const data = await res.json();

    cacheData = Array.isArray(data) ? data : [];
    cacheCountEl.textContent = cacheData.length;

    renderCacheList(cacheData);
  } catch (err) {
    console.error('Error loading cache:', err);
    cacheListEl.innerHTML = '<div class="cache-loading">Failed to load cache.</div>';
  }
}

function renderCacheList(items) {
  if (!items.length) {
    cacheListEl.innerHTML = '<div class="cache-loading">No cached videos.</div>';
    return;
  }

  cacheListEl.innerHTML = '';

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cache-item';

    const title = item.title || '(no title)';
    const id = item.id || '';
    const format = (item.format || '').toUpperCase();

    div.innerHTML = `
      <div class="cache-title">${title}</div>
      <div class="cache-meta">${id}${format ? ' • ' + format : ''}</div>
    `;

    div.addEventListener('click', () => {
      setCacheOpen(false);

      const out = document.getElementById('json-render');
      renderJsonInto(out, item);
      window.updateMiniPlayerForData(item);
      window.lastJsonData = item;

      const pageEl = document.querySelector('.page');
      pageEl.classList.add('show-results');

      const heading = document.getElementById('result-heading');
      heading.classList.remove('underline-animate');
      requestAnimationFrame(() => heading.classList.add('underline-animate'));
    });

    cacheListEl.appendChild(div);
  });
}

cacheToggleEl.addEventListener('click', (e) => {
  e.stopPropagation();

  const willOpen = !cacheOpen;
  setCacheOpen(willOpen);

  if (willOpen) loadCache();
});

document.addEventListener('click', (e) => {
  if (!cacheOpen) return;
  if (cachePanelEl.contains(e.target)) return;
  setCacheOpen(false);
});

window.updateCacheCountOnly();
