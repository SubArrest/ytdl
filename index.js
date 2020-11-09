const ytdl = require("youtube-mp3-downloader");
const fs = require("fs");
const YouTube = require("simple-youtube-api")
const express = require("express");
const app = express();

const port = process.env.PORT || 3000;
const token = process.env.TOKEN;

app.get("/", (req, res) => {
    res.send("hello world");
});

app.get("/ytdl", (req, res) => {
    const youtube = new YouTube(token);
    const YD = new ytdl({
        "ffmpegPath": "/usr/bin/ffmpeg",
        "outputPath": "/root/apis/ytdl/downloads",
        "youtubeVideoQuality": "highest",
    });
    function youtube_parser(url){
        var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
        var match = url.match(regExp);
        return (match&&match[7].length==11)? match[7] : false;
    }
    const ytURL = req.query.link
    if(!ytURL) return res.send({
        error: 400,
        message: "Not A Valid Youtube Video URL Or Video ID"
    });
    fs.access("/root/apis/ytdl/downloads/"+youtube_parser(ytURL)+".json", fs.F_OK, function(err){
		if (err) {
			if(youtube_parser(ytURL) !== false){
				youtube.getVideo(ytURL)
                .then(video => {
                    const Duration = video.durationSeconds
                    if(Duration>600){
                        return res.send({
                            error: 100,
                            message: "Video Duration Exceeds Set Max Amount: 10 Minutes"
                        });
                    }
                    else{
                        YD.download(youtube_parser(ytURL));
                        YD.on("finished", (err, data) => {
                            if(err){
                                return res.send({
                                    error: 500,
                                    message: "Error while trying to get video [1]"
                                });
                            }
                            else{
                                const vidID = data.videoId;
                                let edit = data;
                                edit.url = `http://vs.substuff.org:${port}/ytdl/downloads/${vidID}.mp3`;
                                fs.renameSync(edit.file,`/root/apis/ytdl/downloads/${vidID}.mp3`);
                                delete edit.file;
                                delete edit.artist;
                                delete edit.youtubeUrl;
                                delete edit.stats;
                                delete edit.title;
                                youtube.getVideo(ytURL).then(video => {
                                    edit.channel = video.channel.title;
                                    const jsonStr = JSON.stringify(edit);
                                    fs.writeFileSync(`/root/apis/ytdl/downloads/${vidID}.json`, jsonStr);
                                    return res.send(edit);
                                });
                            }
                        });
                        YD.on("error", err => {
                            return res.send({
                                error: 500,
                                message: "Error while trying to get video [1]"
                            });
                        });
                    }
                })
                .catch(() => {
                    return res.send({
                        error: 400,
                        message: "Not A Valid Youtube Video URL Or Video ID"
                    });
                });
			}
			else return res.send({
                error: 400,
                message: "Not A Valid Youtube Video URL Or Video ID"
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