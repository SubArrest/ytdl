// Theme switching
const THEME_KEY = 'ytdl-ui-theme';

const themeToggle = document.getElementById('theme-toggle');
const toggleThumb = document.querySelector('.toggle-thumb');
const iconSun = document.querySelector('.icon-sun');
const iconMoon = document.querySelector('.icon-moon');

function applyTheme(theme) {
  const body = document.body;
  const isDark = theme === 'dark';
  body.classList.toggle('dark-theme', isDark);
}

// Initial theme
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'dark' || savedTheme === 'light') {
    applyTheme(savedTheme);
  } else {
    applyTheme('dark');
  }
});

// Toggle button handler
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-theme');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);

    // Thumb squish
    if (toggleThumb) {
      toggleThumb.classList.remove('squish');
      void toggleThumb.offsetWidth;
      toggleThumb.classList.add('squish');
    }

    // Icon animations
    if (iconSun && iconMoon) {
      iconSun.classList.remove('spin');
      iconMoon.classList.remove('wobble');
      void iconSun.offsetWidth;
      void iconMoon.offsetWidth;

      if (newTheme === 'dark') {
        iconMoon.classList.add('wobble');
      } else {
        iconSun.classList.add('spin');
      }
    }
  });
}
