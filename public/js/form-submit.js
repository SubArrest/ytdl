// Form submission and result handling
const form = document.getElementById('ytdl-form');
const page = document.querySelector('.page');
const jsonOutput = document.getElementById('json-output');
const processingIndicator = document.getElementById('processing-indicator');
const errorBanner = document.getElementById('error-banner');
const resultHeading = document.getElementById('result-heading');
const body = document.body;

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    page?.classList.remove('show-results');
    if (jsonOutput) jsonOutput.textContent = 'Waiting for response...';
    processingIndicator?.classList.remove('hidden');

    if (resultHeading) {
      resultHeading.classList.remove('underline-animate');
    }

    if (errorBanner) {
      errorBanner.classList.add('hidden');
      errorBanner.textContent = '';
    }

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
        if (errorBanner) {
          errorBanner.textContent = `API Error ${res.status}${data.error ? `: ${data.error}` : ''}`;
          errorBanner.classList.remove('hidden');
        }

        window.lastJsonData = data;
        if (jsonOutput) window.renderJsonInto(jsonOutput, data);
      } else {
        if (errorBanner) {
          errorBanner.classList.add('hidden');
        }

        window.lastJsonData = data;
        if (jsonOutput) window.renderJsonInto(jsonOutput, data);
      }
    } catch (err) {
      if (errorBanner) {
        errorBanner.textContent = `Internal Error: ${err.message}`;
        errorBanner.classList.remove('hidden');
      }

      window.lastJsonData = { error: err.message };
      if (jsonOutput) window.renderJsonInto(jsonOutput, window.lastJsonData);
    } finally {
      processingIndicator.classList.add('hidden');

      page.classList.add('show-results');
      body.classList.add('has-results');

      if (resultHeading) {
        resultHeading.classList.remove('underline-animate');
        requestAnimationFrame(() => {
          resultHeading.classList.add('underline-animate');
        });
      }
    }
  });
}
