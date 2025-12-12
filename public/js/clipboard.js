const copyBtn = document.getElementById('copy-json-btn');

copyBtn.addEventListener('click', async () => {
  if (!window.lastJsonData) return;

  const text = JSON.stringify(window.lastJsonData, null, 2);

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
