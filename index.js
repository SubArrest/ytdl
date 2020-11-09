const express = require("express");
const app = express();

app.get("/", (req, res) => {
    res.send("hello world");
});

app.get("/ytdl", (req, res) => {
    res.send({
        "hello": "world",
        "array": [1,2,3]
    });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening On Port ${port}...`));