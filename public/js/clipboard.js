const copyBtn = document.getElementById('copy-json-btn');

let copyTimer = null;

copyBtn.addEventListener('click', async () => {
if (!window.lastJsonData) return;

try {
	await navigator.clipboard.writeText(JSON.stringify(window.lastJsonData, null, 2));

	copyBtn.classList.add('is-copied');
	if (copyTimer) clearTimeout(copyTimer);
	copyTimer = setTimeout(() => copyBtn.classList.remove('is-copied'), 900);
} catch (err) {
	console.error('Clipboard error:', err);
	// optional: brief shake could go here if you want
}
});