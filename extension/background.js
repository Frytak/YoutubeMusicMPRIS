const socket = io("ws://localhost:9225")

function play(tab) {
    console.info("Playing song");
    browser.tabs.executeScript(tab.id, { code: `document.querySelector("video").play()` });
}

function pause(tab) {
    console.info("Pausing song");
    browser.tabs.executeScript(tab.id, { code: `document.querySelector("video").pause()` });
}

function next(tab) {
    console.info("Playing next song");
    browser.tabs.executeScript(tab.id, { code: `document.querySelector(".next-button").click()` });
}

function previous(tab) {
    console.info("Playing previous song");
    browser.tabs.executeScript(tab.id, { code: `document.querySelector(".previous-button").click()` });
}

function position(tab, pos) {
    console.info("Seeking to " + pos);
    let s_pos = pos / 1000000;
    browser.tabs.executeScript(tab.id, { code: `document.querySelector("video").currentTime = ${s_pos}` });
}

async function getYouTubeMusicTab() {
    return (await browser.tabs.query({ pinned: true, url: "*://music.youtube.com/*" }))[0];
}

async function isPlaying(tab) {
    return (await browser.tabs.executeScript(tab.id, { code: `!document.querySelector("video").paused` }))[0];
}

async function getMetadata(tab) {
    console.info("Retriving metadata");
    return (await browser.tabs.executeScript(tab.id, { code: `{
        let raw_metadata = navigator.mediaSession.metadata
        let metadata = {
            title: raw_metadata.title,
            album: raw_metadata.album,
            artist: raw_metadata.artist,
            artUrl: raw_metadata.artwork[raw_metadata.artwork.length-1].src,
            length: Math.floor(document.querySelector("video").duration * 1000000)
        }
        metadata
    }` }))[0];
}

async function getTimestamp(tab) {
    console.info("Retriving timestamp");
    return (await browser.tabs.executeScript(tab.id, { code: `Math.floor(document.querySelector("video").currentTime * 1000000)` }))[0];
}

let currentMetadata
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "playstate": {
            console.info("Playstate event (" + message.state + ")");
            socket.emit("playstate", message.state);
            break;
        }
        case "metadata": {
            console.info("Metadata event");
            console.info(message.metadata);
            socket.emit("metadata", message.metadata);
            break;
        }
        case "seeked": {
            console.info("Seeked event (" + message.timestamp + ")");
            socket.emit("seeked", message.timestamp);
            break;
        }
    }
});

(async () => {
    currentMetadata = await getMetadata(await getYouTubeMusicTab())

    await browser.tabs.executeScript((await getYouTubeMusicTab()).id, { code: `
        const video = document.querySelector('video');

        video.onpause = () => {
            browser.runtime.sendMessage({ type: "playstate", state: "Paused" });
            browser.runtime.sendMessage({ type: "seeked", timestamp: Math.floor(video.currentTime * 1000000) });
        }

        video.onplay = () => {
            browser.runtime.sendMessage({ type: "playstate", state: "Playing" });
            browser.runtime.sendMessage({ type: "seeked", timestamp: Math.floor(video.currentTime * 1000000) });
        }

        video.onseeked = () => {
            browser.runtime.sendMessage({ type: "seeked", timestamp: Math.floor(video.currentTime * 1000000) });
        }

        video.onloadedmetadata = () => {
            let raw_metadata = navigator.mediaSession.metadata;
            let metadata = {
                title: raw_metadata.title,
                album: raw_metadata.album,
                artist: raw_metadata.artist,
                artUrl: raw_metadata.artwork[raw_metadata.artwork.length-1].src,
                length: video.duration * 1000000
            };

            browser.runtime.sendMessage({ type: "metadata", metadata: metadata });
            browser.runtime.sendMessage({ type: "seeked", timestamp: Math.floor(video.currentTime * 1000000) });
        }

        null;
    `});
})()

socket.on("playpause", async () => {
    const tab = await getYouTubeMusicTab();
    const paused = await isPlaying(tab);

    paused ? play(tab) : pause(tab);
})

socket.on("play", async () => { play(await getYouTubeMusicTab()) });
socket.on("pause", async () => { pause(await getYouTubeMusicTab()) });
socket.on("next", async () => { next(await getYouTubeMusicTab()) });
socket.on("previous", async () => { previous(await getYouTubeMusicTab()) });
socket.on("position", async (pos) => { position(await getYouTubeMusicTab(), pos.position) });
socket.on("metadata", async () => { socket.emit("metadata", await getMetadata(await getYouTubeMusicTab())) });
socket.on("playstate", async () => {
    socket.emit("playstate", (await isPlaying(await getYouTubeMusicTab())) ? "Playing" : "Paused");
    socket.emit("seeked", await getTimestamp(await getYouTubeMusicTab()));
});
