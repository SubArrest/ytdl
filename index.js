const fs = require("fs");
const https = require("https");
const ytdl = require("@distube/ytdl-core");
const YouTube = require("simple-youtube-api")
const qr = require("qrcode");
const { getAverageColor } = require("fast-average-color-node");
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

const youtube = new YouTube(token);

function youtube_parser(url){
	return ytdl.validateURL(url) ? ytdl.getURLVideoID(url) : false
}

app.get("/download/:format?", (req, res) => {
	const ytURL = req.query.link;
	const nolimit = req.query.nolimit=="true";
	let format = req.params.format ? req.params.format.toLowerCase() : "mp3";
	res.header("Content-Type",'application/json');
	if(!ytURL) return res.status(400).send({
		message: "Not A Valid Youtube Video URL Or Video ID"
	});
	fs.access(`./downloads/${youtube_parser(ytURL)}-${format}.json`, fs.F_OK, function(err){
		if (err) {
			const ytID = youtube_parser(ytURL);
			if(ytID){
				youtube.getVideo(ytURL)
				.then(async video => {
					const Duration = video.durationSeconds
					if(Duration>1200 & !nolimit){
						return res.status(413).send({
							message: "Video Duration Exceeds Set Max Amount: 20 Minutes"
						});
					}
					else{
						console.log(`downloading ${ytID} ${format}...`);
						let info = await ytdl.getInfo(ytURL);
						const stream = ytdl.downloadFromInfo(info,{
							quality: 'highestaudio', 
							filter: format => format.container === 'mp4' && format.hasAudio && format.hasVideo
						});
						if(format !== "mp4"){
							stream.on("response", response => {
								new ffmpeg({
									source: stream
								})
								.toFormat(format)
								.on("end", () => {
									youtube.getVideo(ytURL).then(video => {
										qr.toFile(`./downloads/${ytID}.png`, `https://vs.substuff.org/api/ytdl/downloads/${ytID}.${format}`, {errorCorrectionLevel: 'H'}, function(err) {
											if (err) {
												return res.status(500).send({
													message: "QR Code Failed To Send"
												})
											}
											let thumb = `https://i.ytimg.com/vi/${ytID}/maxresdefault.jpg`
											https.get(thumb, (r) => {
												if (r.statusCode === 404) thumb = `https://i.ytimg.com/vi/${ytID}/hqdefault.jpg`

												getAverageColor(thumb)
												.then(color => {
													const edit = {
														videoId: video.id,
														videoTitle: video.title,
														thumbnail: {image: thumb, average: color},
														url: `https://vs.substuff.org/api/ytdl/downloads/${ytID}.${format}`,
														qr: `https://vs.substuff.org/api/ytdl/downloads/${ytID}.png`,
														channel: video.channel.title
													};
													const jsonStr = JSON.stringify(edit);
													fs.writeFileSync(`./downloads/${ytID}-${format}.json`, jsonStr);
													console.log(`(${ytID}) ${format} done!`);
													return res.status(200).send(edit);
												});
											});
										});
									});
								})
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
							});
						}
						else{
							stream.pipe(fs.createWriteStream(`./downloads/${ytID}.mp4`));
							stream.on("end", () => {
								youtube.getVideo(ytURL).then(video => {
									qr.toFile(`./downloads/${ytID}.png`, `https://vs.substuff.org/api/ytdl/downloads/${ytID}.${format}`, {errorCorrectionLevel: 'H'}, function(err) {
										if (err) {
											return res.status(500).send({
												message: "QR Code Failed To Send"
											})
										}
										let thumb = `https://i.ytimg.com/vi/${ytID}/maxresdefault.jpg`
										https.get(thumb, (r) => {
											if (r.statusCode === 404) thumb = `https://i.ytimg.com/vi/${ytID}/hqdefault.jpg`

											getAverageColor(thumb)
											.then(color => {
												const edit = {
													videoId: video.id,
													videoTitle: video.title,
													thumbnail: {image: thumb, average: color},
													url: `https://vs.substuff.org/api/ytdl/downloads/${ytID}.${format}`,
													qr: `https://vs.substuff.org/api/ytdl/downloads/${ytID}.png`,
													channel: video.channel.title
												};
												const jsonStr = JSON.stringify(edit);
												fs.writeFileSync(`./downloads/${ytID}-${format}.json`, jsonStr);
												console.log(`(${ytID}) ${format} done!`);
												return res.status(200).send(edit);
											});
										});
									});
								});
							});	
						}
						stream.on("error", err => {
							console.error(err);
							return res.status(500).send({
								message: "Error while trying to get video"
							});
						});
					}
				})
				.catch(err => {
					console.log(err);
					return res.status(400).send({
						message: "Not A Valid Youtube Video URL Or Video ID"
					});
				});
			}
			else return res.status(400).send({
				message: "Not A Valid Youtube Video URL Or Video ID"
			});
		}
		else{
			fs.readFile(`./downloads/${youtube_parser(ytURL)}-${format}.json`, "utf8" , async (err, data) => {
				if(err) return res.status(500).send({
					message: "Failed To Read Contents Of JSON"
				});
				const decoded = await JSON.parse(data)
				console.log(`(${youtube_parser(ytURL)}) cached ${format} sent!`);
				return res.status(200).send(decoded);
			});
		}
	});
});

app.get("/stream", (req, res) => {
	const link = req.query.link;
	const id = youtube_parser(link);
	if (!link || !id) return res.status(400).send("Not A Valid Youtube Video URL Or Video ID");
	const check = req.headers['sec-fetch-dest'] === 'video';

	res.setHeader('Content-Type', 'audio/mpeg');

	const timeout = setTimeout(() => {
		const astream = ytdl(link,{
			quality: 'highestaudio', 
			filter: format => format.container === 'mp4' && format.hasAudio && format.hasVideo
		});
		astream.on("response", () => {
			new ffmpeg({source: astream})
			.on("end", () => {
				if(check) console.log(`(${id}) stream processed`)
			})
			.on("error", err => {
				if(err.message !== "Output stream closed") console.error(err);
			})
			.format('mp3')
			.audioCodec('libmp3lame')
			.pipe(res, { end: true })
		});
		astream.on("error", err => {
			res.setHeader('Content-Type', 'text/html');
			console.error(err);
			return res.status(500).send("Error while trying to get video");
		});
	});
	req.on("close",() => clearTimeout(timeout));
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
