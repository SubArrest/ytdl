const form = document.getElementById('ytdl-form');
const page = document.querySelector('.page');
const jsonOutput = document.getElementById('json-output');
const processingIndicator = document.getElementById('processing-indicator');
const errorBanner = document.getElementById('error-banner');
const resultHeading = document.getElementById('result-heading');
const body = document.body;

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  page.classList.remove('show-results');
  jsonOutput.textContent = 'Waiting for response...';
  processingIndicator.classList.remove('hidden');

  resultHeading.classList.remove('underline-animate');

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
      data = await res.json();
    } catch (parseErr) {
      throw new Error(`Request failed with ${res.status} and invalid JSON`);
    }

    if (!res.ok) {
      errorBanner.textContent = `API Error ${res.status}${data.error ? `: ${data.error}` : ''}`;
      errorBanner.classList.remove('hidden');
    } else {
      errorBanner.classList.add('hidden');
      window.updateCacheCountOnly();
    }
    window.lastJsonData = data;
    window.renderJsonInto(jsonOutput, data);
    window.updateMiniPlayerForData(data);
  } catch (err) {
    errorBanner.textContent = `Internal Error: ${err.message}`;
    errorBanner.classList.remove('hidden');

    window.lastJsonData = { error: err.message };
    window.renderJsonInto(jsonOutput, window.lastJsonData);
    window.updateMiniPlayerForData(window.lastJsonData);
  } finally {
    processingIndicator.classList.add('hidden');

    page.classList.add('show-results');
    body.classList.add('has-results');

    resultHeading.classList.remove('underline-animate');
    requestAnimationFrame(() => resultHeading.classList.add('underline-animate'));
  }
});
