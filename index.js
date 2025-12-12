import { Sequelize, DataTypes } from "sequelize";
import { unlink } from "fs";
import { get as httpsGet } from "https";

import { YtDlp } from 'ytdlp-nodejs';
import {
  downloadLatestYtDlp,
  createAudioOnlyDownload
} from './ytDlpAudioOnly.js';
const ytPath = await downloadLatestYtDlp({ destDir: './bin' });
const ytdlp = new YtDlp({ binaryPath: ytPath });
await ytdlp.downloadFFmpeg();

import YouTube from "simple-youtube-api";
import { ImgurClient } from "imgur";
import { toDataURL } from "qrcode";
import { getAverageColor } from "fast-average-color-node";
import { PassThrough } from "stream";

import { spawn } from "child_process";

import { config } from "dotenv";
config({
	path: "./.env"
});
import express from "express";
const app = express();

const downloadsPath = "./downloads"

const port = process.env.PORT || 3000;
const token = process.env.TOKEN;

const youtube = new YouTube(token);

const sql = new Sequelize({
	dialect: "sqlite",
	storage: "./videos.sqlite",
	logging: false
});

const videosDB = sql.define(
	"Video",
	{
		pk: {
			type: DataTypes.STRING,
			allowNull: false,
			primaryKey: true
		},
		id: { type: DataTypes.STRING, allowNull: false },
		format: { type: DataTypes.STRING, allowNull: false },
		qr: { type: DataTypes.STRING, allowNull: false },
		videourl: { type: DataTypes.STRING, allowNull: false },
		youtubeurl: { type: DataTypes.STRING, allowNull: false },
		title: { type: DataTypes.STRING, allowNull: false },
		channel: { type: DataTypes.STRING, allowNull: false },
		image: { type: DataTypes.STRING, allowNull: false },
		color: { type: DataTypes.STRING, allowNull: false },
		discord: { type: DataTypes.STRING, allowNull: true },
		imgur: { type: DataTypes.STRING, allowNull: true },
		lastUsed: { type: DataTypes.DATE, allowNull: false }
	},
	{ updatedAt: false }
);

videosDB.sync();
//videosDB.sync({ alter: true });

const imgur = new ImgurClient({
	clientId: process.env.IMGUR_CLIENT_ID,
	clientSecret: process.env.IMGUR_CLIENT_SECRET
});

const validQueryDomains = new Set([
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"music.youtube.com",
	"gaming.youtube.com",
]);
const validPathDomains = /^https?:\/\/(youtu\.be\/|(www\.)?youtube\.com\/(embed|v|shorts|live)\/)/;
const idRegex = /^[a-zA-Z0-9-_]{11}$/;
const validateID = id => idRegex.test(id.trim());

function youtube_parser(link) {
	let parsed 

	try {
        parsed = new URL(link.trim());
    } catch (err) {
        return false; // Invalid URL format
    }

	let id = parsed.searchParams.get("v");

	if (validPathDomains.test(link.trim()) && !id) {
		const paths = parsed.pathname.split("/");
		id = parsed.host === "youtu.be" ? paths[1] : paths[2];
	} else if (parsed.hostname && !validQueryDomains.has(parsed.hostname)) return false; //Not a YouTube domain

	if (!id) return false; //No video id found

	id = id.substring(0, 11);
	if (!validateID(id)) return false; //Video id does not match expected format

	return id;
};

let downloadingCurrentList = [];

const sendError = (res, code, message, ytID) => {
	if (ytID) downloadingCurrentList = downloadingCurrentList.filter(id => id !== ytID);

	return res.status(code).json({ message });
};

const sendData = (res, video, ytID, format) => {
	let thumb = `https://i.ytimg.com/vi/${ytID}/maxresdefault.jpg`;
	httpsGet(thumb, r => {
		thumb = r.statusCode === 404 ? `https://i.ytimg.com/vi/${ytID}/hqdefault.jpg` : thumb;

		getAverageColor(thumb)
			.then(async color => {
				const v = await videosDB.create({
					pk: `${format}-${ytID}`,
					id: ytID,
					format: format,
					qr: `https://vs.substuff.org/api/ytdl/qr/${ytID}.${format}`,
					videourl: `https://vs.substuff.org/api/ytdl/downloads/${ytID}.${format}`,
					youtubeurl: video.youtubeurl,
					title: video.title,
					channel: video.channel,
					image: thumb,
					color: color.rgb,
					lastUsed: new Date(Date.now()).toISOString()
				});

				console.log(`(${ytID}) ${format} done!`);

				downloadingCurrentList = downloadingCurrentList.filter(id => id !== ytID);

				const out = v.get();
				delete out.pk;
				delete out.createdAt;
				delete out.lastUsed;
				delete out.discord;
				delete out.imgur;

				return res.status(200).json(out);
			})
			.catch(err => {
				console.error(err);
				return sendError(res, 500, "Error while finalising video data", ytID);
			});
	});
};

const formats = {
	audio: ["aac","flac","mp3","m4a","opus","vorbis","wav","alac"],
	video: ["mkv","mp4","ogg","webm","flv"]
};

//Stops browsers like chrome from sending 2 requests (breaking shit)
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get("/download/:format?", async (req, res) => {
	const ytURL = req.query.link;
	const nolimit = req.query.nolimit == "true";
	let format = req.params.format ? req.params.format.toLowerCase() : "mp3";

	res.header("Content-Type",'application/json');

	const ytID = youtube_parser(ytURL);

	if (!ytURL) return sendError(res, 400, "Not A Valid Youtube Video URL Or Video ID");
	if (!ytID) return sendError(res, 400, "Not A Valid Youtube Video URL Or Video ID");
	if (downloadingCurrentList.includes(ytID)) return sendError(res, 429, "This video is already being processed. Please try again shortly.");

	const count = await videosDB.count({ where: { pk: `${format}-${ytID}` } });

	if (count > 0) {
		videosDB.findByPk(`${format}-${ytID}`).then(async video => {
			console.log(`(${ytID}) cached ${format} sent!`);

			video.lastUsed = new Date(Date.now()).toISOString();
			await video.save();

			const out = video.get();
			delete out.pk;
			delete out.createdAt;
			delete out.lastUsed;
			if (!out.discord) delete out.discord;
			if (!out.imgur) delete out.imgur;

			res.status(200).json(out);
		});
		return;
	}

	let filter = "mergevideo";
	if (formats.audio.includes(format)) {
		filter = "audioonly";
	} else if (!formats.video.includes(format)) {
		return sendError(res, 400, "Format Not Supported");
	}

	downloadingCurrentList.push(ytID);

	let video;
	try {
		const info = await youtube.getVideo(ytURL);

		const dur = info.duration;
		const duration =
			dur.seconds +
			(dur.minutes * 60) +
			(dur.hours * 60 * 60) +
			(dur.days * 24 * 60 * 60);

		video = {
			title: info.title,
			channel: info.channel.title,
			youtubeurl: `https://www.youtube.com/watch?v=${info.id}`,
			duration: duration
		};
	} catch (err) {
		console.log(err.message);
		return sendError(
			res,
			500,
			"Unable To Fetch Video, Likely Copyright Or Region Locked",
			ytID
		);
	}

	if (!video) {
		downloadingCurrentList = downloadingCurrentList.filter(id => id !== ytID);
		return;
	}

	if (video.duration > 1200 & !nolimit) {
		return sendError(
			res,
			413,
			"Video Duration Exceeds Set Max Amount: 20 Minutes",
			ytID
		);
	}

	console.log(`downloading ${ytID} ${format}...`);

	if (filter === "audioonly") {
		const job = createAudioOnlyDownload({
			videoUrl: ytURL,
			format,
			ytdlpPath: ytPath,
			outputFilePath: `${downloadsPath}/${ytID}.${format}`
		});

		job.on('progress', (p) => {
			//console.log('progress:', p);
		});

		job.on('finished', () => {
			return sendData(res, video, ytID, format);
		});

		job.on('error', (err) => {
			unlink(`${downloadsPath}/${ytID}.${format}`, err2 => {
				if (err2) console.error(err2);
			});

			console.error(err);

			return sendError(
				res,
				500,
				"Error while trying to get video",
				ytID
			);
		});
	}
	else {
		ytdlp.download(ytURL,{
			format: {
				filter,
				type: format,
				quality: 'highest',
			},
			output: `${downloadsPath}/${ytID}.${format}`
		})
		.on('progress', (progress) => {
			//console.log(progress);
		})
		.on('exit', (code) => {
			if(code === 0) return sendData(res, video, ytID, format);

			//error code
			unlink(`${downloadsPath}/${ytID}.${format}`, err2 => {
				if (err2) console.error(err2);
			});

			console.error(err);

			return sendError(
				res,
				500,
				"Error while trying to get video",
				ytID
			);
		})
		.on('error', (err) => {
			unlink(`${downloadsPath}/${ytID}.${format}`, err2 => {
				if (err2) console.error(err2);
			});

			console.error(err);

			return sendError(
				res,
				500,
				"Error while trying to get video",
				ytID
			);
		});
	}
});

app.get("/showcache", async (req, res) => {
	const videos = await videosDB.findAll();

	const out = await Promise.all(
		videos.map(async video => {
			const {id,format,qr,videourl,youtubeurl,title,channel,image,color,discord,imgur} = await video.get();

			return {id,format,qr,videourl,youtubeurl,title,channel,image,color,
				...(discord != null && { discord }),
				...(imgur != null && { imgur })
			}
		})
	);

	res.status(200).json(out);
});

let streamers = {};
let cache = {};
const stop = (id,del) => {
    if (streamers[id]) {
        streamers[id].stream.destroy();
        streamers[id].process.kill("SIGKILL");
		if (streamers[id].progress !== 1 || del) delete streamers[id];
    }
};
app.get("/stream", async (req, res) => {
	const link = req.query.link;
	const id = youtube_parser(link);
    if (!link || !id) {
        return res.status(400).json({
			message: "Not A Valid Youtube Video URL Or Video ID"
		});
    }

	try {
		const info = await youtube.getVideo(link);

		const dur = info.duration;
		const duration =
			dur.seconds +
			(dur.minutes * 60) +
			(dur.hours * 60 * 60) +
			(dur.days * 24 * 60 * 60);

		let thumb = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
		httpsGet(thumb, (r) => {
			thumb = r.statusCode === 404 ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : thumb;

			getAverageColor(thumb)
			.then(color => {
				return res.status(200).json({
					id: info.id,
					videourl: `https://vs.substuff.org/api/ytdl/stream/audio?id=${id}`,
					youtubeurl: `https://www.youtube.com/watch?v=${info.id}`,
					title: info.title,
					channel: info.channel.title,
					duration,
					image: thumb,
					color: color.rgb
				});
			});
		});
	} catch (err) {
		console.error(err.message);
		return sendError(
			res,
			500,
			"Unable To Fetch Video, Likely Copyright Or Region Locked"
		);
	}
});

app.get("/stream/audio", async (req, res) => {
	const id = req.query.id;
	if (!id) return res.status(400).json({ message: "Missing video ID" });

	const link = `https://www.youtube.com/watch?v=${id}`;
	res.setHeader("Content-Type", "audio/mpeg");

	res.on("error", (err) => {
		if (err.code === "EPIPE" || err.code === "ECONNRESET") return;
		console.error(`[${id}] Response error:`, err);
	});

	if (cache[id]) {
		console.log(`Serving cached audio for: ${id}`);
		const cachedBuffer = Buffer.concat(cache[id].buffer);
		return res.end(cachedBuffer);
	}

	if (!streamers[id]) {
		console.log(`Starting new stream for: ${id}`);

		const info = await youtube.getVideo(link);
		const dur = info.duration;
		const videoDuration =
			dur.seconds +
			dur.minutes * 60 +
			dur.hours * 3600 +
			dur.days * 86400;

		const inputStream = new PassThrough();
		ytdlp
			.stream(link, {
				format: {
					filter: "audioonly",
					type: "mp3",
					quality: "highest"
				}
			})
			.pipe(inputStream);

		const ffArgs = [
			"-loglevel", "error",
			"-progress", "pipe:2",
			"-i", "pipe:0",
			"-vn",
			"-acodec", "libmp3lame",
			"-b:a", "192k",
			"-f", "mp3",
			"pipe:1"
		];

		const ff = spawn("ffmpeg", ffArgs, {
			stdio: ["pipe", "pipe", "pipe"]
		});

		ff.stdin.on("error", (err) => {
			if (err.code === "EPIPE") return;
			console.error(`[${id}] ffmpeg stdin error:`, err);
		});

		inputStream.pipe(ff.stdin);

		const passThrough = new PassThrough();
		const bufferChunks = [];

		passThrough.on("error", (err) => {
			if (err.code === "EPIPE" || err.code === "ECONNRESET") return;
			console.error(`[${id}] PassThrough error:`, err);
		});

		ff.stdout.on("data", (chunk) => {
			bufferChunks.push(chunk);
			passThrough.write(chunk);
		});

		ff.stdout.on("end", () => {
			passThrough.end();
		});

		ff.stdout.on("error", (err) => {
			if (err.code === "EPIPE") return;
			console.error(`[${id}] ffmpeg stdout error:`, err);
		});
		ff.stderr.on("error", (err) => {
			if (err.code === "EPIPE") return;
			console.error(`[${id}] ffmpeg stderr error:`, err);
		});

		let currentOut = {};
		ff.stderr.setEncoding("utf8");

		ff.stderr.on("data", (data) => {
			const lines = data.split(/\r?\n/);

			for (const line of lines) {
				if (!line.includes("=")) continue;

				const [key, value] = line.split("=");

				if (key === "out_time_ms") {
					currentOut.time = parseInt(value, 10) / 1_000_000;
				}

				if (key === "progress" && value === "continue") {
					if (streamers[id] && currentOut.time != null) {
						streamers[id].progress = Math.min(
							1,
							currentOut.time / videoDuration
						);
					}
					currentOut = {};
				}

				if (key === "progress" && value === "end") {
					if (streamers[id]) streamers[id].progress = 1;
				}
			}
		});

		ff.on("close", (code, sig) => {
			if (sig !== "SIGKILL") {
				console.log(`[${id}] Stream processed`);

				for (const key of Object.keys(cache)) {
					clearTimeout(cache[key].timeout);
					delete cache[key];
				}

				cache[id] = {
					buffer: bufferChunks,
					timeout: setTimeout(() => delete cache[id], 7200 * 1000)
				};
			}

			stop(id, true);
		});

		ff.on("error", (err) => {
			console.error(`[${id}] ffmpeg process error:`, err);
			stop(id, true);
		});

		streamers[id] = {
			stream: inputStream,
			process: ff,
			output: passThrough,
			progress: 0,
			bufferChunks,
			listeners: 0,
			idleTimeout: null
		};
	}

	if (streamers[id].progress !== 1) {
		streamers[id].listeners++;

		clearTimeout(streamers[id].idleTimeout);
    	streamers[id].idleTimeout = null;

		for (const chunk of streamers[id].bufferChunks) {
			try {
				res.write(chunk);
			} catch (err) {
				if (err.code === "EPIPE" || err.code === "ECONNRESET") return;
				console.error(`[${id}] res.write error:`, err);
			}
		}

		streamers[id].output.pipe(res);
		console.log(`[${id}] Listener Joined: ${streamers[id].listeners}`);
	}

	req.on("close", () => {
		const streamer = streamers[id];
  		if (!streamer) return;

		streamer.listeners--;
		if (streamer.listeners < 0) streamer.listeners = 0;
		console.log(`[${id}] Listener Left, Remaining: ${streamer.listeners}`);

		if (streamer.listeners > 0) return;

		if (!streamer.idleTimeout && streamer.progress <= 0.99) {
			streamer.idleTimeout = setTimeout(() => {
				const s = streamers[id];
				if (!s) return;

				if (s.listeners === 0 && s.progress <= 0.99) {
					console.log(`[${id}] No listeners after idle timeout, stopping stream`);
					stop(id);
				}

				s.idleTimeout = null;
			}, 5000);
		}
	});
});

app.get("/playlist", (req, res) => {
	const link = req.query.link;
	const shuffle = req.query.shuffle=="true";
	youtube.getPlaylist(link)
    .then(playlist => {
        playlist.getVideos()
		.then(videos => {
			if(shuffle){
				const s = videos
					.map(v => `https://www.youtube.com/watch?v=${v.id}`)
					.map(value => ({ value, sort: Math.random() }))
					.sort((a, b) => a.sort - b.sort)
					.map(({ value }) => value);
				res.status(200).send(s);
			}else{
				const s = videos.map(v => `https://www.youtube.com/watch?v=${v.id}`)
				res.status(200).send(s);
			}
		})
		.catch(err => {
			return res.status(400).send({
				message: "Not A Valid Youtube Playlist URL Or Playlist ID"
			});
		});
    })
	.catch(err => {
		return res.status(400).send({
			message: "Not A Valid Youtube Playlist URL Or Playlist ID"
		});
	});
})

/* need to replace with gdrive or smth cus imgur not available in uk :(
app.get("/imgur", async (req, res) => {
    const img = req.query.img;
    const id = req.query.id;
    const format = req.query.format;
    if(!img) return res.status(400).send({
        message: "Image Not Provided"
    });

    const count = await videosDB.count({ where: { pk: `${format}-${id}` } });

    if(count > 0) {
        videosDB.findByPk(`${format}-${id}`).then(async video => {
            if(video.imgur) return res.status(200).send({
                url: video.imgur
            });

            const response = await imgur.upload({
                image: img,
                title: 'YTDL Thumb Upload'
            });

            if(response.data == "Bad Request") return res.status(400).send({
                message: "Invalid Image"
            });

			if(typeof response.data.link !== "string") return res.status(400).send({
                message: "Bad Request"
            });

            video.imgur = response.data.link;
            await video.save();

            console.log(`(${id}) ${format} modified with imgur link!`);

            return res.status(200).send({
                image: response.data.link
            });
        });
    } else if(!id || !format) {
        const response = await imgur.upload({
            image: img,
            title: 'YTDL Thumb Upload'
        });

        if(response.data == "Bad Request") return res.status(400).send({
            message: "Invalid Image"
        });

        return res.status(200).send({
            image: response.data.link
        });
    }
});
*/

app.get("/qr/:file?", async (req, res) => {
	let file = req.params.file;

	if(!file) return res.status(400).send({
        message: "Filename Not Provided"
    });

	res.header("Content-Type", 'image/png');

	const img = await toDataURL(`https://vs.substuff.org/api/ytdl/downloads/${file}`,{ scale: 10 });
	const out = Buffer.from(img.split(",")[1], 'base64');

	res.header("Content-Length", img.length);

	return res.status(200).send(out);
});

app.use("/downloads", express.static("./downloads"));

app.listen(port, () => console.log(`Listening On Port ${port}...`));
