const miniPlayerEl = document.getElementById('mini-audio-player');
const miniPlayBtn = document.getElementById('mini-audio-play');
const miniTrackEl = document.getElementById('mini-audio-track');
const miniTrackFillEl = document.getElementById('mini-audio-track-fill');
const miniThumbEl = document.getElementById('mini-audio-thumb');
const miniAudioEl = document.getElementById('mini-audio');

const AUDIO_EXTS = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.aac', '.alac'];

const playIcon  = miniPlayBtn.querySelector('.mini-audio-icon--play');
const pauseIcon = miniPlayBtn.querySelector('.mini-audio-icon--pause');

function isAudioUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url, window.location.origin);
    const path = u.pathname.toLowerCase();
    const dot = path.lastIndexOf('.');
    if (dot === -1) return false;
    const ext = path.slice(dot);
    return AUDIO_EXTS.includes(ext);
  } catch {
    return false;
  }
}

function setPlayingUI(isPlaying) {
  playIcon.style.display  = isPlaying ? 'none' : 'block';
  pauseIcon.style.display = isPlaying ? 'block' : 'none';

  miniPlayBtn.setAttribute('aria-label', isPlaying ? 'Pause audio' : 'Play audio');
}

function updateProgress() {
  if (!miniAudioEl.duration || isNaN(miniAudioEl.duration)) return;

  const ratio = Math.max(0, Math.min(1, miniAudioEl.currentTime / miniAudioEl.duration));
  const pct = ratio * 100;
  miniTrackFillEl.style.width = `${pct}%`;
  miniThumbEl.style.left = `${pct}%`;
}

function scrubTo(clientX) {
  const rect = miniTrackEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, x / rect.width));

  if (miniAudioEl.duration && !isNaN(miniAudioEl.duration)) miniAudioEl.currentTime = ratio * miniAudioEl.duration;
  updateProgress();
}

// Play / pause toggle
miniPlayBtn.addEventListener('click', () => {
  if (!miniAudioEl.src) return;

  if (miniAudioEl.paused) {
    miniAudioEl
      .play()
      .then(() => setPlayingUI(true))
      .catch((err) => console.error('Audio play error:', err));
  } else {
    miniAudioEl.pause();
    setPlayingUI(false);
  }
});

miniAudioEl.addEventListener('timeupdate', updateProgress);
miniAudioEl.addEventListener('ended', () => setPlayingUI(false));
miniTrackEl.addEventListener('click', (e) => scrubTo(e.clientX));

window.updateMiniPlayerForData = function (data) {
  const url = data && data.videourl;

  if (!isAudioUrl(url)) {
    miniAudioEl.pause();
    miniAudioEl.removeAttribute('src');
    miniPlayerEl.classList.add('mini-audio-player--hidden');
    miniPlayerEl.setAttribute('aria-hidden', 'true');
    setPlayingUI(false);
    miniTrackFillEl.style.width = '0%';
    miniThumbEl.style.left = '0%';
    return;
  }

  if (miniAudioEl.src !== url) {
    miniAudioEl.pause();
    miniAudioEl.src = url;
    miniAudioEl.load();
    miniTrackFillEl.style.width = '0%';
    miniThumbEl.style.left = '0%';
    setPlayingUI(false);
  }

  miniPlayerEl.classList.remove('mini-audio-player--hidden');
  miniPlayerEl.setAttribute('aria-hidden', 'false');
};
