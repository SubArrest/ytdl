// Background particles
function initParticles() {
  const count = 30;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';

    p.style.left = Math.random() * 100 + 'vw';

    const size = 3 + Math.random() * 3;
    p.style.width = size + 'px';
    p.style.height = size + 'px';

    const duration = 18 + Math.random() * 12;
    p.style.animationDuration = duration + 's';

    const delay = -Math.random() * duration;
    p.style.animationDelay = delay + 's';

    const opacity = 0.25 + Math.random() * 0.25;
    p.style.opacity = opacity.toString();

    document.body.appendChild(p);
  }
}

// Mouse parallax
function initParallax() {
  const media = window.matchMedia('(pointer: fine)');
  if (!media.matches) return;

  document.addEventListener('mousemove', (e) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    const dx = (e.clientX - cx) / cx;
    const dy = (e.clientY - cy) / cy;

    const offsetX = dx * 20;
    const offsetY = dy * 20;

    document.documentElement.style.setProperty('--parallax-x', `${offsetX}px`);
    document.documentElement.style.setProperty('--parallax-y', `${offsetY}px`);
  });
}

// Particle init
window.addEventListener('DOMContentLoaded', () => {
  initParticles();
  initParallax();
});
