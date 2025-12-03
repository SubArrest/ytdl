// Element references
const form = document.getElementById('ytdl-form');
const page = document.querySelector('.page');
const jsonOutput = document.getElementById('json-output');
const processingIndicator = document.getElementById('processing-indicator');
const copyBtn = document.getElementById('copy-json-btn');
const errorBanner = document.getElementById('error-banner');
const resultHeading = document.getElementById('result-heading');

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

  if (linkFromUrl) {
	linkInput.value = linkFromUrl;
  }
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

