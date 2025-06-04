const Player = require("mpris-service");
const { exec } = require('child_process');
const io = require("socket.io")(9225, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const fs = require('fs');
const request = require('request');

function download(uri, filename, callback) {
    request.head(uri, function(err, res, body) {
        request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    });
}

const player = Player({
    name: "youtube-music",
    identity: "Firefox pinned YouTube Music tab",
    supportedInterfaces: ["player"]
});

const events = ["playpause", "play", "pause", "next", "previous", "position"];

for (const event of events) {
    player.on(event, (data) => {
        console.log(`Received event from playerctl: ${event}`);
        console.log(data);
        io.emit(event, data);
    });
}

io.on("connection", (socket) => {
    socket.on("metadata", (metadata) => {
        console.log("Received metadata from extension");
        console.log(metadata);

        player.metadata = {
            "xesam:title": metadata.title ?? "",
            "xesam:album": metadata.album ?? "",
            "xesam:artist": [ metadata.artist ?? "" ],
            "mpris:trackid": "/org/mpris/MediaPlayer2/youtube_music",
            "mpris:artUrl": metadata.artUrl ?? "",
            "mpris:length": metadata.length ?? 0,
        };

        console.log(`Downloading song art for ${player.metadata["xesam:title"]} - ${player.metadata["xesam:artist"]}`);
        // The download can take longer for a previous art while switching music, it can override the image
        download(metadata.artUrl, '/tmp/youtube-music-mpris-server-art.png', () => {
            console.log(`Downloading song art for ${player.metadata["xesam:title"]} - ${player.metadata["xesam:artist"]}`);
            player.metadata = {
                "xesam:title": metadata.title ?? "",
                "xesam:album": metadata.album ?? "",
                "xesam:artist": [ metadata.artist ?? "" ],
                "mpris:trackid": "/org/mpris/MediaPlayer2/youtube_music",
                "mpris:artUrl": "/tmp/youtube-music-mpris-server-art.png",
                "mpris:length": metadata.length ?? 0,
            };
        });
    });

    socket.on("playstate", (playstate) => {
        console.log("Received playstate: " + playstate);
        player.playbackStatus = playstate;
    });

    player.getPosition = () => {
        console.log("Getting current position");
        io.emit("playstate");
    };

    socket.on("seeked", (timestamp) => {
        console.log("Received seeked event: " + timestamp);
        player.seeked(timestamp);
    });

    io.emit("metadata");
    io.emit("playstate");
});
