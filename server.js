import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const UI_PORT = 3100;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const formats = {
  audio: ["aac", "flac", "mp3", "m4a", "opus", "vorbis", "wav", "alac"],
  video: ["mkv", "mp4", "ogg", "webm", "flv"]
};

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Provide formats to front-end
app.get('/formats', (req, res) => {
  res.json(formats);
});

// Handle form submission and proxy to existing /download API
app.post('/process', async (req, res) => {
  try {
    const { textField, dropdown, checkbox } = req.body;

    const link = textField;                 // URL from the form
    const format = dropdown || 'mp3';       // default mp3 if somehow empty
    const nolimit = checkbox === 'on' ? 'true' : 'false';

    // Build path: /download (for mp3) or /download/FORMAT
    const formatPath = format === 'mp3'
      ? '' // mp3 = use base /download route
      : `/${encodeURIComponent(format)}`;

    // Build query string for your API
    const params = new URLSearchParams({
      link,
      nolimit
    });

    const apiUrl = `http://localhost:3000/download${formatPath}?${params.toString()}`;
    console.log('Calling API:', apiUrl);

    // Node 18+ has global fetch. If on older Node, install node-fetch.
    const apiResponse = await fetch(apiUrl);

    // Your API always returns JSON (success or error)
    const data = await apiResponse.json();

    // Forward JSON + status to the browser
    res.status(apiResponse.status).json(data);
  } catch (err) {
    console.error('Error calling /download API:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to contact /download API',
      error: err.message
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(UI_PORT, () => {
  console.log(`UI server running at http://localhost:${UI_PORT}`);
  console.log(`Existing API expected at http://localhost:3000/download...`);
});
