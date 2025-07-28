import { Sequelize, DataTypes } from "sequelize";
import { createWriteStream, unlink } from "fs";
import { get as httpsGet } from "https";

import ytdl from "@distube/ytdl-core";
//import ytdl from "@nuclearplayer/ytdl-core";

import YouTube from "simple-youtube-api";
import { ImgurClient } from "imgur";
import { toDataURL } from "qrcode";
import { getAverageColor } from "fast-average-color-node";
import { PassThrough } from "stream";
import ffmpeg from "fluent-ffmpeg";
ffmpeg.setFfmpegPath("/usr/bin/ffmpeg");
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

function youtube_parser(url){
	return ytdl.validateURL(url) ? ytdl.getURLVideoID(url) : false
}

const sendData = (res,video,ytID,format) => {
	let thumb = `https://i.ytimg.com/vi/${ytID}/maxresdefault.jpg`
	httpsGet(thumb, r => {
		thumb = r.statusCode === 404 ? `https://i.ytimg.com/vi/${ytID}/hqdefault.jpg` : thumb;

		getAverageColor(thumb)
		.then(async color => {
			const v = await videosDB.create({
				pk: `${format}-${video.videoId}`,
				id: video.videoId,
				format: format,
				qr: `https://vs.substuff.org/api/ytdl/qr/${ytID}.${format}`,
				videourl: `https://vs.substuff.org/api/ytdl/downloads/${ytID}.${format}`,
				youtubeurl: video.video_url,
				title: video.title,
				channel: video.author.name,
				image: thumb,
				color: color.rgb,
				lastUsed: new Date(Date.now()).toISOString()
			});

			console.log(`(${ytID}) ${format} done!`);

			const out = v.get();
			delete out.pk;
			delete out.createdAt;
			delete out.lastUsed;
			delete out.discord;
			delete out.imgur;

			return res.status(200).json(out);
		});
	});
};

app.get("/download/:format?", async (req, res) => {
	const ytURL = req.query.link;
	const nolimit = req.query.nolimit=="true";
	let format = req.params.format ? req.params.format.toLowerCase() : "mp3";

	res.header("Content-Type",'application/json');

	if(!ytURL) return res.status(400).send({
		message: "Not A Valid Youtube Video URL Or Video ID"
	});

	const ytID = youtube_parser(ytURL);

	if(!ytID) return res.status(400).send({
		message: "Not A Valid Youtube Video URL Or Video ID"
	});

	const count = await videosDB.count({ where: { pk: `${format}-${ytID}` } });

	if(count > 0) {
		videosDB.findByPk(`${format}-${ytID}`).then(async video => {
			console.log(`(${ytID}) cached ${format} sent!`);

			video.lastUsed = new Date(Date.now()).toISOString();
			await video.save();

			const out = video.get();
			delete out.pk;
			delete out.createdAt;
			delete out.lastUsed;
			if(!out.discord) delete out.discord;
			if(!out.imgur) delete out.imgur;

			res.status(200).json(out);
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

	const video = info.videoDetails;

	const Duration = video.lengthSeconds;
	if(Duration>1200 & !nolimit) return res.status(413).send({
		message: "Video Duration Exceeds Set Max Amount: 20 Minutes"
	});

	console.log(`downloading ${ytID} ${format}...`);

	const stream = ytdl.downloadFromInfo(info,{
		quality: 'highestaudio', 
		filter: format => format.container === 'mp4' && format.hasAudio && format.hasVideo
	});

	if(format === "mp4"){
		stream.pipe(createWriteStream(`${downloadsPath}/${ytID}.mp4`));
		stream.on("end", () => sendData(res,video,ytID,format));	
		return;
	}

	ffmpeg(stream)
	.toFormat(format)
	.on("end", () => sendData(res,video,ytID,format))
	.on("error", err => {
		console.error(err.message);

		unlink(`${downloadsPath}/${ytID}.${format}`, err => {
			if(err) console.error(err);
		});
		return res.status(400).send({
			message: "Format Not Supported"
		});
	})
	.pipe(createWriteStream(`${downloadsPath}/${ytID}.${format}`));

	stream.on("error", err => {
		console.error(err);

		return res.status(500).send({
			message: "Error while trying to get video"
		});
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
