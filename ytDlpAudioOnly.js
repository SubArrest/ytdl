import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import https from 'node:https';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

const { mkdir, chmod } = fsPromises;

// ---------------------------------------------------------------------------
// Download latest yt-dlp release binary from GitHub
// ---------------------------------------------------------------------------

function downloadFileFollowRedirects(url, filePath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function doRequest(currentUrl, redirectsLeft) {
      const req = https.get(
        currentUrl,
        {
          headers: {
            'User-Agent': 'node-ytdlp-downloader'
          }
        },
        (res) => {
          // Redirect
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            if (redirectsLeft <= 0) {
              res.resume();
              return reject(
                new Error(
                  `Too many redirects while downloading yt-dlp. Last URL: ${currentUrl}`
                )
              );
            }
            const redirectUrl = res.headers.location;
            res.destroy();
            return doRequest(redirectUrl, redirectsLeft - 1);
          }

          // Non-OK
          if (res.statusCode !== 200) {
            res.resume();
            return reject(
              new Error(
                `Failed to download yt-dlp, status ${res.statusCode} from ${currentUrl}`
              )
            );
          }

          const fileStream = createWriteStream(filePath);
          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(resolve);
          });

          fileStream.on('error', (err) => {
            res.destroy();
            fileStream.destroy();
            reject(err);
          });
        }
      );

      req.on('error', (err) => {
        reject(err);
      });
    }

    doRequest(url, maxRedirects);
  });
}

/**
 * Download the latest yt-dlp binary from GitHub releases.
 *
 * @param {object} [options]
 * @param {string} [options.destDir]   Directory to save yt-dlp into (default: ./bin)
 * @param {string} [options.filename]  Filename to use (default: yt-dlp or yt-dlp.exe on Windows)
 *
 * @returns {Promise<string>} absolute path to the downloaded binary
 */
export async function downloadLatestYtDlp({ destDir, filename } = {}) {
  const finalDestDir = destDir || join(process.cwd(), 'bin');
  const defaultName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const finalFilename = filename || defaultName;

  const baseUrl =
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
  const downloadUrl =
    process.platform === 'win32'
      ? `${baseUrl}/yt-dlp.exe`
      : `${baseUrl}/yt-dlp`;

  await mkdir(finalDestDir, { recursive: true });
  const targetPath = join(finalDestDir, finalFilename);

  await downloadFileFollowRedirects(downloadUrl, targetPath);

  if (process.platform !== 'win32') {
    await chmod(targetPath, 0o755);
  }

  return targetPath;
}

// ---------------------------------------------------------------------------
// Audio format presets (same as your audio-only presets)
// ---------------------------------------------------------------------------

export const AUDIO_FORMAT_PRESETS = {
  mp3: [
    '-vn',
    '-acodec', 'libmp3lame',
    '-b:a', '192k'
  ],

  m4a: [
    '-vn',
    '-acodec', 'aac',
    '-b:a', '192k'
  ],

  aac: [
    '-vn',
    '-acodec', 'aac',
    '-b:a', '192k'
  ],

  opus: [
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '128k'
  ],

  vorbis: [
    '-vn',
    '-c:a', 'libvorbis',
    '-q:a', '5'
  ],

  ogg: [
    '-vn',
    '-c:a', 'libvorbis',
    '-q:a', '5'
  ],

  flac: [
    '-vn',
    '-acodec', 'flac'
  ],

  wav: [
    '-vn',
    '-acodec', 'pcm_s16le'
  ],

  alac: [
    '-vn',
    '-acodec', 'alac'
  ]
};

// ---------------------------------------------------------------------------
// Progress parser for yt-dlp "[download]" lines
// ---------------------------------------------------------------------------

function parseYtDlpProgressLine(line) {
  // Pattern 1: normal progress
  // [download]   6.1% of 3.42MiB at 1.12MiB/s ETA 00:03
  const regex1 =
    /\[download\]\s+([\d.]+)%\s+of\s+(\S+)\s+(?:at\s+(\S+))?\s*(?:ETA\s+(\S+))?/;

  // Pattern 2: final summary
  // [download] 100% in 00:00:55
  const regex2 =
    /\[download\]\s+([\d.]+)%\s+in\s+(\S+)/;

  let match = line.match(regex1);
  if (match) {
    const percent = parseFloat(match[1]);
    const totalSize = match[2];
    const speed = match[3] || null;
    const etaRaw = match[4] || null;

    let eta = null;
    if (etaRaw && etaRaw !== 'UNKNOWN') {
      const parts = etaRaw.split(':').map(Number);
      if (parts.every((n) => !Number.isNaN(n))) {
        if (parts.length === 2) {
          const [m, s] = parts;
          eta = m * 60 + s;
        } else if (parts.length === 3) {
          const [h, m, s] = parts;
          eta = h * 3600 + m * 60 + s;
        } else if (parts.length === 4) {
          const [d, h, m, s] = parts;
          eta = d * 86400 + h * 3600 + m * 60 + s;
        }
      }
    }

    return {
      percent: Number.isFinite(percent) ? percent : null,
      totalSize,
      speed,
      etaRaw,
      eta,
      raw: line
    };
  }

  match = line.match(regex2);
  if (match) {
    const percent = parseFloat(match[1]);
    const elapsedRaw = match[2];

    return {
      percent: Number.isFinite(percent) ? percent : null,
      totalSize: null,
      speed: null,
      etaRaw: null,
      eta: 0,
      elapsedRaw,
      raw: line
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Standalone audio-only downloader
// ---------------------------------------------------------------------------

/**
 * Download audio-only from a YouTube URL using yt-dlp -> ffmpeg.
 *
 * - yt-dlp: bestaudio[ext=webm]/bestaudio → stdout
 * - ffmpeg: convert to requested audio format (mp3/m4a/flac/etc.)
 *
 * @param {object} options
 * @param {string} options.videoUrl         YouTube URL
 * @param {string} options.format           Target audio format (mp3, m4a, aac, flac, wav, opus, vorbis, ogg, alac)
 * @param {string} [options.ytdlpPath]      Path to yt-dlp binary (default: "yt-dlp")
 * @param {string} [options.ffmpegPath]     Path to ffmpeg binary (default: "ffmpeg")
 * @param {string[]} [options.ytdlpArgs]    Custom yt-dlp args (override defaults)
 * @param {string[]} [options.ffmpegExtraArgs] Custom ffmpeg args (override presets)
 * @param {string} [options.outputFilePath] Optional path to save the transcoded audio
 * @param {object} [options.spawnOptionsYtDlp]  child_process.spawn options for yt-dlp
 * @param {object} [options.spawnOptionsFfmpeg] child_process.spawn options for ffmpeg
 *
 * @returns {object} controller:
 *   - outputStream: Readable (ffmpeg stdout)
 *   - ytDlpChild: ChildProcess
 *   - ffmpegChild: ChildProcess
 *   - on(event, handler)
 *   - once(event, handler)
 *   - off(event, handler)
 *   - kill(signal)
 *
 * Events:
 *   - "start"                -> yt-dlp spawned
 *   - "progress"             -> { percent?, totalSize?, speed?, etaRaw?, eta?, raw? }
 *   - "stderr"               -> { source: "yt-dlp"|"ffmpeg", line }
 *   - "yt-dlp-stderr"        -> raw yt-dlp stderr line
 *   - "ffmpeg-stderr"        -> raw ffmpeg stderr line
 *   - "download-finished"    -> yt-dlp exited 0
 *   - "download-close"       -> yt-dlp "close" event
 *   - "finished"             -> ffmpeg exited 0 (whole pipeline done)
 *   - "close"                -> ffmpeg "close" (success or error)
 *   - "error"                -> any error in either process or file stream
 */
export function createAudioOnlyDownload({
  videoUrl,
  format,
  ytdlpPath = 'yt-dlp',
  ffmpegPath = 'ffmpeg',
  ytdlpArgs,
  ffmpegExtraArgs,
  outputFilePath,
  spawnOptionsYtDlp = {},
  spawnOptionsFfmpeg = {}
}) {
  if (!videoUrl) throw new Error('videoUrl is required');
  if (!format) throw new Error('format is required');

  const fmt = format.toLowerCase();
  const emitter = new EventEmitter();

  const preset =
    ffmpegExtraArgs || AUDIO_FORMAT_PRESETS[fmt] || ['-vn', '-acodec', 'copy'];

  // Default yt-dlp args: best WebM/Opus (or best audio) → stdout
  const baseYtDlpArgs = ytdlpArgs || [
    '-f', 'bestaudio[ext=webm]/bestaudio',
    '-o', '-',
    '--no-warnings',
    '--progress',
    '--newline'
  ];

  const effectiveYtDlpArgs = [...baseYtDlpArgs, videoUrl];

  // Spawn yt-dlp
  const ytDlpChild = spawn(
    ytdlpPath,
    effectiveYtDlpArgs,
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...spawnOptionsYtDlp
    }
  );

  ytDlpChild.on('spawn', () => {
    emitter.emit('start');
  });

  // Parse yt-dlp stderr for progress
  if (ytDlpChild.stderr) {
    ytDlpChild.stderr.setEncoding('utf8');
    let stderrBuffer = '';

    ytDlpChild.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        emitter.emit('yt-dlp-stderr', trimmed);
        emitter.emit('stderr', { source: 'yt-dlp', line: trimmed });

        const parsed = parseYtDlpProgressLine(trimmed);
        if (parsed) {
          emitter.emit('progress', parsed);
        } else if (/download/i.test(trimmed) && /%/.test(trimmed)) {
          // Heuristic fallback
          emitter.emit('progress', {
            percent: null,
            totalSize: null,
            speed: null,
            etaRaw: null,
            eta: null,
            raw: trimmed
          });
        }
      }
    });
  }

  ytDlpChild.on('error', (err) => {
    if (err.code === 'EPIPE') return;
    emitter.emit('error', err);
  });

  ytDlpChild.on('close', (code, signal) => {
    const info = { code, signal };

    if (code === 0) {
      emitter.emit('download-finished', info);
    } else {
      const err = new Error(
        `yt-dlp exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`
      );
      err.code = code;
      err.signal = signal;
      emitter.emit('error', err);
    }

    emitter.emit('download-close', info);
  });

  // ffmpeg pipeline: stdin = yt-dlp stdout, stdout = transcoded audio
  const ffmpegArgs = [
    '-hide_banner',
    '-loglevel', 'error',
    '-fflags', '+genpts',
    '-i', 'pipe:0',
    ...preset,
    '-f', fmt,
    'pipe:1'
  ];

  const ffmpegChild = spawn(
    ffmpegPath,
    ffmpegArgs,
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...spawnOptionsFfmpeg
    }
  );

  // Ignore EPIPE on ffmpeg stdin (yt-dlp closing early, etc.)
  if (ffmpegChild.stdin) {
    ffmpegChild.stdin.on('error', (err) => {
      if (err.code === 'EPIPE') return;
      emitter.emit('error', err);
      ytDlpChild.kill('SIGKILL');
    });
  }

  // Pipe yt-dlp stdout -> ffmpeg stdin
  if (!ytDlpChild.stdout) {
    throw new Error('yt-dlp stdout is not available (stdio config)');
  }
  ytDlpChild.stdout.pipe(ffmpegChild.stdin);

  // Tee ffmpeg stdout to a PassThrough and optional file
  const outputStream = new PassThrough();
  ffmpegChild.stdout.pipe(outputStream);

  let fileStream = null;
  if (outputFilePath) {
    fileStream = createWriteStream(outputFilePath);
    outputStream.pipe(fileStream);

    fileStream.on('error', (err) => {
      emitter.emit('error', err);
    });
  }

  // ffmpeg stderr
  let ffmpegStderrLog = '';

  ffmpegChild.stderr.setEncoding('utf8');
  ffmpegChild.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.trim()) {
      ffmpegStderrLog += text + '\n';
      emitter.emit('ffmpeg-stderr', text);
      emitter.emit('stderr', { source: 'ffmpeg', line: text });
    }
  });

  ffmpegChild.on('error', (err) => {
    if (err.code === 'EPIPE') return;
    emitter.emit('error', err);
    ytDlpChild.kill('SIGKILL');
  });

  ffmpegChild.on('close', (code, signal) => {
    const info = { code, signal };

    if (fileStream) {
      fileStream.end();
    }

    if (code === 0) {
      emitter.emit('finished', info); // whole pipeline done
    } else {
      const err = new Error(
        `ffmpeg exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`
      );
      err.code = code;
      err.signal = signal;
      err.stderr = ffmpegStderrLog || null;
      emitter.emit('error', err);
    }

    emitter.emit('close', info);
  });

  function kill(signal = 'SIGTERM') {
    if (!ytDlpChild.killed) ytDlpChild.kill(signal);
    if (!ffmpegChild.killed) ffmpegChild.kill(signal);
  }

  return {
    outputStream,
    ytDlpChild,
    ffmpegChild,

    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off?.bind(emitter) || emitter.removeListener.bind(emitter),

    kill
  };
}
