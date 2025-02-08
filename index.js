const fs = require("fs");
const { get: httpsGet } = require("https");
const ytdl = require("@distube/ytdl-core");
const YouTube = require("simple-youtube-api")
const { toFile: qrToFile } = require("qrcode");
const { getAverageColor } = require("fast-average-color-node");
const { AttachmentBuilder, WebhookClient } = require("discord.js");
const { PassThrough } = require("stream");
const ffmpeg = require("fluent-ffmpeg");
ffmpeg.setFfmpegPath("/usr/bin/ffmpeg");
const { config } = require("dotenv");
config({
	path: "./.env"
});
const express = require("express");
const app = express();

const port = process.env.PORT || 3000;
const token = process.env.TOKEN;

const webhookClient = new WebhookClient({ id: process.env.WEBHOOKID, token: process.env.WEBHOOKTOKEN });

const youtube = new YouTube(token);

function youtube_parser(url){
	return ytdl.validateURL(url) ? ytdl.getURLVideoID(url) : false
}

const sendData = (res,video,ytID,format,urlPath,jsonPath) => qrToFile(`./downloads/${ytID}.png`, urlPath, {errorCorrectionLevel: 'H'}, (err) => {
	if (err) return res.status(500).send({
		message: "QR Code Failed To Send"
	});

	let thumb = `https://i.ytimg.com/vi/${ytID}/maxresdefault.jpg`
	httpsGet(thumb, (r) => {
		thumb = r.statusCode === 404 ? `https://i.ytimg.com/vi/${ytID}/hqdefault.jpg` : thumb;

		getAverageColor(thumb)
		.then(color => {
			const edit = {
				videoId: video.videoId,
				videoUrl: video.video_url,
				videoTitle: video.title,
				thumbnail: {image: thumb, average: color},
				url: urlPath,
				qr: `https://vs.substuff.org/api/ytdl/downloads/${ytID}.png`,
				channel: video.author.name
			};

			const jsonStr = JSON.stringify(edit);
			fs.writeFileSync(jsonPath, jsonStr);

			console.log(`(${ytID}) ${format} done!`);

			return res.status(200).send(edit);
		});
	});
});

app.get("/download/:format?", async (req, res) => {
	const ytURL = req.query.link;
	const nolimit = req.query.nolimit=="true";
	let format = req.params.format ? req.params.format.toLowerCase() : "mp3";

	res.header("Content-Type",'application/json');

	if(!ytURL) return res.status(400).send({
		message: "Not A Valid Youtube Video URL Or Video ID"
	});

	const ytID = youtube_parser(ytURL);
	const jsonPath = `./downloads/${ytID}-${format}.json`
	const urlPath = `https://vs.substuff.org/api/ytdl/downloads/${ytID}.${format}`

	if(!ytID) return res.status(400).send({
		message: "Not A Valid Youtube Video URL Or Video ID"
	});

	fs.access(`./downloads/${youtube_parser(ytURL)}-${format}.json`, fs.F_OK, async (err) => {
		if (!err) {
			fs.readFile(jsonPath, "utf8" , async (err, data) => {
				if(err) return res.status(500).send({
					message: "Failed To Read Contents Of JSON"
				});

				const decoded = await JSON.parse(data)

				console.log(`(${ytID}) cached ${format} sent!`);

				return res.status(200).send(decoded);
			});
			return;
		}

		let info = await ytdl.getInfo(ytURL)
		.catch(err => {
			console.log(err);
			return res.status(500).send({
				message: "Unable To Fetch Video, Likely Copyright Or Region Locked"
			});
		});

		if(info.statusCode) return; //video failed to fetch

		const video = info.videoDetails

		const Duration = video.lengthSeconds
		if(Duration>1200 & !nolimit) return res.status(413).send({
			message: "Video Duration Exceeds Set Max Amount: 20 Minutes"
		});

		console.log(`downloading ${ytID} ${format}...`);

		const stream = ytdl.downloadFromInfo(info,{
			quality: 'highestaudio', 
			filter: format => format.container === 'mp4' && format.hasAudio && format.hasVideo
		});

		if(format === "mp4"){
			stream.pipe(fs.createWriteStream(`./downloads/${ytID}.mp4`));
			stream.on("end", () => sendData(res,video,ytID,format,urlPath,jsonPath));	
			return;
		}
		ffmpeg(stream)
		.toFormat(format)
		.on("end", () => sendData(res,video,ytID,format,urlPath,jsonPath))
		.on("error", err => {
			console.error(err.message);

			fs.unlink(`./downloads/${ytID}.${format}`, err => {
				if(err) console.error(err);
			});
			return res.status(400).send({
				message: "Format Not Supported"
			});
		})
		.pipe(fs.createWriteStream(`./downloads/${ytID}.${format}`));

		stream.on("error", err => {
			console.error(err);

			return res.status(500).send({
				message: "Error while trying to get video"
			});
		});
	});
});

app.get("/discord", (req, res) => {
	const id = req.query.id;
	fs.readFile(`./downloads/${id}-mp3.json`, "utf8" , async (err, data) => {
		if (err) {
			return res.status(400).send({
				message: "Downloaded Video Not Found"
			})
		}

		const decoded = await JSON.parse(data)

		const att = new AttachmentBuilder()
			.setName(`${decoded.videoTitle}.mp3`)
			.setFile(`./downloads/${id}.mp3`);

		try{
			const message = await webhookClient.send({
				content: "",
				username: 'YTDL',
				files: [att]
			})

			console.log(`(${id}) cached mp3 sent to discord!`);
			return res.status(200).send({
				url: message.attachments[0].url
			});
		}
		catch(err) {
			return res.status(500).send({
				message: err.message
			});
		}
	});
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
        const info = await ytdl.getInfo(link);
		const video = info.videoDetails;
        const id = video.videoId;
		
		let thumb = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
		httpsGet(thumb, (r) => {
			thumb = r.statusCode === 404 ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : thumb;

			getAverageColor(thumb)
			.then(color => {
				return res.status(200).json({
					videoId: id,
					videoUrl: video.video_url,
					videoTitle: video.title,
					videoDuration: video.lengthSeconds,
					thumbnail: {image: thumb, average: color},
					url: `https://vs.substuff.org/api/ytdl/stream/audio?id=${id}`,
					channel: video.author.name
				});
			});
		});
    } catch (err) {
        console.log(err);
		return res.status(500).send({
			message: "Unable To Fetch Video, Likely Copyright Or Region Locked"
		});
    }
});

app.get("/stream/audio", async (req, res) => {
	const id = req.query.id;

	if (!id) return res.status(400).json({ message: "Missing video ID" });

	const link = `https://www.youtube.com/watch?v=${id}`;

	res.setHeader('Content-Type', 'audio/mpeg');

	if (cache[id]) {
		console.log(`Serving cached audio for: ${id}`);
		const cachedBuffer = Buffer.concat(cache[id].buffer);

		return res.end(cachedBuffer);
	}

	if (!streamers[id]) {
        console.log(`Starting new stream for: ${id}`);

		const info = await ytdl.getInfo(link);
		const videoDuration = info.videoDetails.lengthSeconds;
        const stream = ytdl.downloadFromInfo(info, {
            quality: "highestaudio",
            filter: (format) => format.container === "mp4" && format.hasAudio && format.hasVideo
        });

        const ffmpegStream = ffmpeg(stream)
            .format("mp3")
            .audioCodec("libmp3lame")
            .audioBitrate(192)
            .on("end", () => {
                console.log(`[${id}] Stream processed`);
				Object.keys(cache).forEach(key => {
					clearTimeout(cache[key].timeout);
					console.log(`Cleared cache timeout for ${key}`);
					delete cache[key];
				});

                cache[id] = {
					buffer: streamers[id].bufferChunks,
					timeout: setTimeout(() => {
						console.log(`Cache expired for: ${id}`);
						delete cache[id];
					}, Math.round( Math.max(900, Math.min(videoDuration, 7200)) ) * 1000)
				}
				stop(id,true);
            })
			.on("progress", progress => {
				if (streamers[id]) { 
					const time = progress.timemark;
					const [hours, minutes, seconds] = time.split(':');
					const totalSeconds = Math.round( (+hours) * 60 * 60 + (+minutes) * 60 + (+seconds) );
					streamers[id].progress = totalSeconds/videoDuration;
				}
			})
            .on("error", (err) => {
                if (err.message !== "ffmpeg was killed with signal SIGKILL") {
					console.error(err);
					stop(id,true);
				}
            });
		
        const passThrough = new PassThrough();
		const bufferChunks = [];
        ffmpegStream.pipe(passThrough);

		passThrough.on("data", (chunk) => {
            bufferChunks.push(chunk);
        });

        streamers[id] = {
            stream,
            process: ffmpegStream,
            output: passThrough,
			progress: 0,
			bufferChunks,
            listeners: 0
        };
    }

    if (streamers[id].progress !== 1) {
		streamers[id].listeners++;
    
		for (const chunk of streamers[id].bufferChunks) {
			res.write(chunk);
		}

		streamers[id].output.pipe(res);
		console.log(`[${id}] Listener Joined: ${streamers[id].listeners}`);
	}

    req.on("close", () => {
        streamers[id].listeners--;
		if (streamers[id].listeners < 0) streamers[id].listeners = 0;
		console.log(`[${id}] Listener Left, Remaining: ${streamers[id].listeners}`);
        if (streamers[id].listeners <= 0 && streamers[id].progress <= 0.99) stop(id);
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

app.use("/downloads", express.static("./downloads"));

app.listen(port, () => console.log(`Listening On Port ${port}...`));
