const fs = require("fs");
const ytdl = require("ytdl-core");
const YouTube = require("simple-youtube-api")
const ffmpeg = require("fluent-ffmpeg");
ffmpeg.setFfmpegPath("/usr/bin/ffmpeg");
const { config } = require("dotenv");
config({
	path: "/root/apis/ytdl/.env"
});
const express = require("express");
const app = express();

const port = process.env.PORT || 3000;
const token = process.env.TOKEN;

const youtube = new YouTube(token);

function youtube_parser(url){
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    var match = url.match(regExp);
    return (match&&match[7].length==11)? match[7] : false;
}

app.get("/", (req, res) => {
    const ytURL = req.query.link
    if(!ytURL) return res.send({
        error: 400,
        message: "Not A Valid Youtube Video URL Or Video ID [1]"
    });
    fs.access("/root/apis/ytdl/downloads/"+youtube_parser(ytURL)+".json", fs.F_OK, function(err){
		if (err) {
			if(youtube_parser(ytURL) !== false){
				youtube.getVideo(ytURL)
                .then(async video => {
                    const Duration = video.durationSeconds
                    if(Duration>600){
                        return res.send({
                            error: 100,
                            message: "Video Duration Exceeds Set Max Amount: 10 Minutes"
                        });
                    }
                    else{
                        const ytID = youtube_parser(ytURL);
                        let info = await ytdl.getInfo(ytURL);
                        const stream = ytdl.downloadFromInfo(info,{
                            quality: 'highestaudio', 
                            filter: format => format.container === 'mp4' && format.hasAudio && format.hasVideo
                        });
                        stream.on("response", response => {
                            new ffmpeg({
                                source: stream
                            })
                            .toFormat("mp3")
                            .on("end", () => {
                                youtube.getVideo(ytURL).then(video => {
                                    const edit = {
                                        videoId: video.id,
                                        videoTitle: video.title,
                                        thumbnail: video.thumbnails.high.url,
                                        url: `https://vs.substuff.org/api/ytdl/downloads/${ytID}.mp3`,
                                        channel: video.channel.title
                                    };
                                    const jsonStr = JSON.stringify(edit);
                                    fs.writeFileSync(`/root/apis/ytdl/downloads/${ytID}.json`, jsonStr);
                                    return res.send(edit);
                                });
                            })
                            .on("error", err => {
                                console.error(err);
                                return res.send({
                                    error: 500,
                                    message: "Error while trying to get video [1]"
                                });
                            })
                            .pipe(fs.createWriteStream(`/root/apis/ytdl/downloads/${ytID}.mp3`));
                        });
                        stream.on("error", err => {
                            console.error(err);
                            return res.send({
                                error: 500,
                                message: "Error while trying to get video [2]"
                            });
                        });
                    }
                })
                .catch(err => {
                    console.error(err);
                    return res.send({
                        error: 400,
                        message: "Not A Valid Youtube Video URL Or Video ID [2]"
                    });
                });
			}
			else return res.send({
                error: 400,
                message: "Not A Valid Youtube Video URL Or Video ID [3]"
            });
		}
		else{
            fs.readFile(`/root/apis/ytdl/downloads/${youtube_parser(ytURL)}.json`, "utf8" , async (err, data) => {
                if(err) return res.send({
                    error: 200,
                    message: "Failed To Read Contents Of JSON"
                });
                const decoded = await JSON.parse(data)
                return res.send(decoded);
            });
        }
    });
});

app.use("/ytdl/downloads", express.static("/root/apis/ytdl/downloads"));

app.listen(port, () => console.log(`Listening On Port ${port}...`));
