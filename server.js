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

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/formats', (req, res) => res.json(formats));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/process', async (req, res) => {
    try {
        const { textField, dropdown, checkbox } = req.body;

        const link = textField;
        const format = dropdown || 'mp3';
        const nolimit = checkbox === 'on' ? 'true' : 'false';

        const formatPath = format === 'mp3' ? '' : `/${encodeURIComponent(format)}`;

        const params = new URLSearchParams({link,nolimit});

        const apiUrl = `http://localhost:3000/download${formatPath}?${params.toString()}`;
        console.log('Calling API:', apiUrl);

        const apiResponse = await fetch(apiUrl);

        const data = await apiResponse.json();

        res.status(apiResponse.status).json(data);
    } catch (err) {
        console.error('Error calling /download API:', err);

        res.status(500).json({message: 'Failed to contact /download API'});
    }
});

app.listen(UI_PORT, () => console.log(`UI server running at http://localhost:${UI_PORT}`));
