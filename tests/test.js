const fs = require("fs");
const crypto = require("crypto");
const bdecode = require("../misc/bdecode.js");
const enums = require("../misc/utils.js");
const Tracker = require("../tracker/index.js");
const PeerClient = require("../peer/client.js");

const _wait = ms => new Promise(r => setTimeout(r,ms));
function quickHash(data){
    const sha1 = crypto.createHash("sha1");
    sha1.update(data);
    return sha1.digest();
}
(async function main(){
    const peerId = enums.generate_peer_id("js", 1);
    const port = await enums.find_port();
    console.debug(`Torrent.JS\nListening on port: ${port}`);
    const file = fs.readFileSync("./test.torrent");
    const val = bdecode(file);
    const infoData = val.info.originalBuffer;
    console.log(val);

    const infoHash = quickHash(infoData);

    const peer = new PeerClient({
        host: "127.0.0.1",
        port,
        peerId,
        infoHash
    });
    peer.on("state", state => {
        console.log("state", state);
        peer.interested(true);
    });
    peer.once("ready", () => {
        console.log("ready");
        peer.bitfield([0]);
    });
    peer.on("pieces", pieces => console.log("pieces", pieces));
})();