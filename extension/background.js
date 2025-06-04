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
    let tab = (await browser.tabs.query({ pinned: true, url: "*://music.youtube.com/*" }))[0];
    console.debug(`Retrieved tab (${tab.id})`);
    return tab;
}

async function isPlaying(tab) {
    let playstate = (await browser.tabs.executeScript(tab.id, { code: `!document.querySelector("video").paused` }))[0];
    console.debug(`Retrieved playstate (${playstate})`);
    return playstate;
}

async function getMetadata(tab) {
    let metadata = (await browser.tabs.executeScript(tab.id, { code: `{
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
    console.debug("Retrieved metadata");
    console.debug(metadata);
    return metadata;
}

async function getTimestamp(tab) {
    let timestamp = (await browser.tabs.executeScript(tab.id, { code: `Math.floor(document.querySelector("video").currentTime * 1000000)` }))[0];
    console.debug(`Retrieved timestamp (${timestamp})`);
    return timestamp;
}

async function tryAddingVideoListeners() {
    try {
        await browser.tabs.executeScript((await getYouTubeMusicTab()).id, { code: `
            var video = document.querySelector('video');

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

        socket.emit("metadata", await getMetadata(await getYouTubeMusicTab()))
        socket.emit("playstate", (await isPlaying(await getYouTubeMusicTab())) ? "Playing" : "Paused");
        socket.emit("seeked", await getTimestamp(await getYouTubeMusicTab()));
    } catch (err) {
        console.warning("Failed adding tab video listeners, trying again in 4 seconds");
        setTimeout(tryAddingVideoListeners, 4000);
    }
}

socket.on("playpause", async () => {
    const tab = await getYouTubeMusicTab();
    const paused = await isPlaying(tab);

    paused ? play(tab) : pause(tab);
})

socket.on("play", async () => { console.log("Received `play` event from server"); play(await getYouTubeMusicTab()) });
socket.on("pause", async () => { console.log("Received `pause` event from server"); pause(await getYouTubeMusicTab()) });
socket.on("next", async () => { console.log("Received `next` event from server"); next(await getYouTubeMusicTab()) });
socket.on("previous", async () => { console.log("Received `previous` event from server"); previous(await getYouTubeMusicTab()) });
socket.on("position", async (pos) => { console.log("Received `position` event from server"); position(await getYouTubeMusicTab(), pos.position) });
socket.on("metadata", async () => { console.log("Received `metadata` event from server"); socket.emit("metadata", await getMetadata(await getYouTubeMusicTab())) });
socket.on("playstate", async () => {
    console.log("Received `playstate` event from server");
    socket.emit("playstate", (await isPlaying(await getYouTubeMusicTab())) ? "Playing" : "Paused");
    socket.emit("seeked", await getTimestamp(await getYouTubeMusicTab()));
});

try {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.type) {
            case "playstate": {
                console.log(`Received \`playstate\` event from tab (${message.state})`);
                socket.emit("playstate", message.state);
                break;
            }
            case "metadata": {
                console.log(`Received \`metadata\` event from tab`);
                console.debug(message.metadata);
                socket.emit("metadata", message.metadata);
                break;
            }
            case "seeked": {
                console.log(`Received \`seeked\` event from tab (${message.timestamp})`);
                socket.emit("seeked", message.timestamp);
                break;
            }
        }
    });
} catch (err) {
    console.error(`Unable to add tab event listener. ${err}`);
}

(async () => {
    try{
        await tryAddingVideoListeners();
    } catch(err) {
        console.error(`Unable to add tab video event listeners. ${err}`);
    }
})()
