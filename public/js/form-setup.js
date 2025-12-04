// Form setup
const dropdown = document.getElementById('dropdown');

// Populate format dropdown
if (dropdown) {
  fetch('/ytdl/formats')
    .then((res) => res.json())
    .then((formats) => {
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
    })
    .catch((err) => {
      console.error('Failed to load formats:', err);
    });
}

// Prefill link from URL
window.addEventListener('DOMContentLoaded', () => {
  const url = new URL(window.location.href);
  const linkInput = document.querySelector('input[name="textField"]');
  if (!linkInput) return;

  let linkFromUrl = url.searchParams.get('link');

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
