// Element references
const form = document.getElementById('ytdl-form');
const page = document.querySelector('.page');
const jsonOutput = document.getElementById('json-output');
const processingIndicator = document.getElementById('processing-indicator');
const copyBtn = document.getElementById('copy-json-btn');
const errorBanner = document.getElementById('error-banner');
const resultHeading = document.getElementById('result-heading');
const themeToggle = document.getElementById('theme-toggle');
const toggleThumb = document.querySelector('.toggle-thumb');
const iconSun = document.querySelector('.icon-sun');
const iconMoon = document.querySelector('.icon-moon');

const THEME_KEY = 'ytdl-ui-theme';

function applyTheme(theme) {
  const body = document.body;
  const isDark = theme === 'dark';

  body.classList.toggle('dark-theme', isDark);
}

function initParticles() {
  const count = 30; // how many particles you want
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';

    // random horizontal position
    p.style.left = Math.random() * 100 + 'vw';

    // random size between 3px and 6px
    const size = 3 + Math.random() * 3;
    p.style.width = size + 'px';
    p.style.height = size + 'px';

    // random animation duration between 18s and 30s
    const duration = 18 + Math.random() * 12;
    p.style.animationDuration = duration + 's';

    // random negative delay so they start at different heights
    const delay = -Math.random() * duration;
    p.style.animationDelay = delay + 's';

    // slight opacity variation
    const opacity = 0.25 + Math.random() * 0.25;
    p.style.opacity = opacity.toString();

    document.body.appendChild(p);
  }
}

function initParallax() {
  // Only do parallax on devices with a mouse / fine pointer
  const media = window.matchMedia('(pointer: fine)');
  if (!media.matches) return;

  document.addEventListener('mousemove', (e) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    const dx = (e.clientX - cx) / cx; // -1 to 1
    const dy = (e.clientY - cy) / cy; // -1 to 1

    // Scale down so it's subtle
    const offsetX = dx * 20; // px
    const offsetY = dy * 20; // px

    document.documentElement.style.setProperty('--parallax-x', `${offsetX}px`);
    document.documentElement.style.setProperty('--parallax-y', `${offsetY}px`);
  });
}

/* -----------------------------
   POPULATE FORMAT DROPDOWN
   ----------------------------- */
fetch('/ytdl/formats')
  .then((res) => res.json())
  .then((formats) => {
    const dropdown = document.getElementById('dropdown');

    Object.entries(formats).forEach(([category, types]) => {
      const group = document.createElement('optgroup');
      group.label = category.toUpperCase();

      types.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;

      if (type === 'mp3') option.selected = true;

      group.appendChild(option);
      });

      dropdown.appendChild(group);
    });
  });

/* -----------------------------
   PREFILL LINK FIELD FROM URL
   - supports ?link=... and /ytdl/<encoded-url>
   ----------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  // --- THEME INIT ---
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'dark' || savedTheme === 'light') {
    applyTheme(savedTheme);
  } else {
    applyTheme('dark');
  }

  const url = new URL(window.location.href);
  const linkInput = document.querySelector('input[name="textField"]');
  if (!linkInput) return;

  // Option 1: ?link=URL
  let linkFromUrl = url.searchParams.get('link');

  // Option 2: path after /ytdl/ is encoded URL
  if (!linkFromUrl) {
	const path = url.pathname;
	if (path && path !== '/ytdl/') {
	  const encoded = path.slice(6);
	  try {
		  linkFromUrl = decodeURIComponent(encoded);
	  } catch (e) {
		  console.warn('Failed to decode path as URL:', e);
	  }
	}
  }

  if (linkFromUrl) linkInput.value = linkFromUrl;

  initParticles();
  initParallax();
});

/* -----------------------------
   COPY JSON BUTTON
   ----------------------------- */
copyBtn.addEventListener('click', async () => {
  if (!lastJsonData) return;

  const text = JSON.stringify(lastJsonData, null, 2);

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = 'Copy JSON';
    }, 1200);
  } catch (err) {
    console.error('Clipboard error:', err);
    copyBtn.textContent = 'Failed :(';
    setTimeout(() => {
      copyBtn.textContent = 'Copy JSON';
    }, 1200);
  }
});

/* -----------------------------
   FORM SUBMIT HANDLER
   - prevent page navigation
   - show processing indicator
   - POST via fetch
   - render JSON on success/error
   - animate layout to show result box
   ----------------------------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  page.classList.remove('show-results');
  jsonOutput.textContent = 'Waiting for response...';
  processingIndicator.classList.remove('hidden');
  
  if (resultHeading) {
    resultHeading.classList.remove('underline-animate');
  }

  // Always hide banner initially
  errorBanner.classList.add('hidden');
  errorBanner.textContent = '';

  const formData = new FormData(form);

  try {
    const res = await fetch(form.action, {
      method: form.method,
      body: new URLSearchParams(formData),
    });

    let data;
    try {
      data = await res.json();   // parse JSON even on error
    } catch (parseErr) {
      throw new Error(`Request failed with ${res.status} and invalid JSON`);
    }

    if (!res.ok) {
      // Show API-provided error JSON WITH a red banner
      errorBanner.textContent = `API Error ${res.status}${data.error ? `: ${data.error}` : ''}`;
      errorBanner.classList.remove('hidden');

      lastJsonData = data;
      renderJsonInto(jsonOutput, data);
    } else {
      // Success → hide banner
      errorBanner.classList.add('hidden');

      lastJsonData = data;
      renderJsonInto(jsonOutput, data);
    }
  } catch (err) {
	// Network-level or parsing failure
	errorBanner.textContent = `Internal Error: ${err.message}`;
	errorBanner.classList.remove('hidden');

	lastJsonData = { error: err.message };
	renderJsonInto(jsonOutput, lastJsonData);
  } finally {
    processingIndicator.classList.add('hidden');

    // Show results layout first
    page.classList.add('show-results');

    // Restart underline animation AFTER layout is visible
    if (resultHeading) {
      resultHeading.classList.remove('underline-animate');

      // Wait for next frame so CSS sees the removal, then add it back
      requestAnimationFrame(() => {
        resultHeading.classList.add('underline-animate');
      });
    }
  }
});

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-theme');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);

    // Squish animation on the thumb
    if (toggleThumb) {
      toggleThumb.classList.remove('squish');
      void toggleThumb.offsetWidth;
      toggleThumb.classList.add('squish');
    }

    // Icon animations: spin sun when going to light mode, wobble moon when going to dark mode
    if (iconSun && iconMoon) {
      // clear previous animations so they can restart
      iconSun.classList.remove('spin');
      iconMoon.classList.remove('wobble');
      void iconSun.offsetWidth;
      void iconMoon.offsetWidth;

      if (newTheme === 'dark') {
        // Dark mode just activated → moon wobble
        iconMoon.classList.add('wobble');
      } else {
        // Light mode just activated → sun spin
        iconSun.classList.add('spin');
      }
    }
  });
}

