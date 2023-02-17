const fs = require("fs");
const ytdl = require("ytdl-core");
const YouTube = require("simple-youtube-api")
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
	var regExp = /^(?:https?:\/\/)?(?:(?:www\.)?youtube.com\/(?:shorts\/|watch\?v=)|(?:youtu.be\/(?!watch\?)|youtu.be\/(?:watch\?v=))(?!.*shorts\/))([^#&?]*).*/
	var match = url.match(regExp);
	return (match&&match[1].length==11)? match[1] : false;
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
			if(youtube_parser(ytURL) !== false){
				youtube.getVideo(ytURL)
				.then(async video => {
					const Duration = video.durationSeconds
					if(Duration>1200 & !nolimit){
						return res.status(413).send({
							message: "Video Duration Exceeds Set Max Amount: 20 Minutes"
						});
					}
					else{
						const ytID = youtube_parser(ytURL);
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
										const edit = {
											videoId: video.id,
											videoTitle: video.title,
											thumbnail: video.thumbnails.high.url,
											url: `https://vs.substuff.org/api/ytdl/downloads/${ytID}.${format}`,
											channel: video.channel.title
										};
										const jsonStr = JSON.stringify(edit);
										fs.writeFileSync(`./downloads/${ytID}-${format}.json`, jsonStr);
										console.log(`(${ytID}) ${format} done!`);
										return res.status(200).send(edit);
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
									const edit = {
										videoId: video.id,
										videoTitle: video.title,
										thumbnail: video.thumbnails.high.url,
										url: `https://vs.substuff.org/api/ytdl/downloads/${ytID}.mp4`,
										channel: video.channel.title
									};
									const jsonStr = JSON.stringify(edit);
									fs.writeFileSync(`./downloads/${ytID}-mp4.json`, jsonStr);
									console.log(`(${ytID}) mp4 done!`);
									return res.status(200).send(edit);
								});
							});	
						}
						stream.on("error", err => {
							return res.status(500).send({
								message: "Error while trying to get video"
							});
						});
					}
				})
				.catch(err => {
					console.error(err);
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

	res.setHeader('Content-Type', 'audio/mpeg');
	const timeout = setTimeout(() => {
		const astream = ytdl(link,{
			quality: 'highestaudio', 
			filter: format => format.container === 'mp4' && format.hasAudio && format.hasVideo
		});
		astream.on("response", () => {
			new ffmpeg({source: astream})
			.on("end", () => {
				console.log(`(${id}) stream processed`)
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
			return res.status(500).send("Error while trying to get video");
		});
	});
	req.on("close",() => clearTimeout(timeout));
});

app.use("/downloads", express.static("./downloads"));

app.listen(port, () => console.log(`Listening On Port ${port}...`));
