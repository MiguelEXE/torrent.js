const fs = require("fs");
const crypto = require("crypto");
const bdecode = require("../misc/bdecode.js");
const enums = require("../misc/utils.js");
const Tracker = require("../tracker/index.js");
const PeerServer = require("../peer/server.js");
// PeerServer tested on test

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
    
    /*const tracker = new Tracker({
        infoHash,
        peerId,
        port,
        url: val.announce.toString(),
        left: 23616024
    });
    tracker.on("peer", peer => {
        console.log(`> New peer ${peer.ip}:${peer.port}`);
        const client = new PeerClient({
            host: peer.ip,
            port: peer.port,
            infoHash,
            peerId
        });
        let a = false;
        client.on("state", async state => {
            if(!state.peer_choking){
                client.interested(true);
                if(!a){
                    console.log(client.peer_pieces_indexes);
                    a = true
                    for(let i=0;i<4;i++){
                        let b;
                        if(i === 3){
                            b = 1403
                        }
                        client.request(i, b);
                        console.log(i);
                        await _wait(11500);
                    }
                }
            }
        });
        client.on("piece", data => {
            console.log("piece!", data);
        });
    });*/
    const server = new PeerServer({
        host: "127.0.0.1",
        port: 6881
    });
    server.on("connection", connection => {
        console.log(connection);
        connection.once("connectionAttempt", () => {
            console.log("Connect attempt", connection.peerId, connection.infoHash);
            connection.acceptConnection(connection.infoHash, peerId);
        });
        connection.once("ready", () => {
            console.log("ready");
            connection.choking(false);
        });
        connection.on("state", s => {
            console.log("state", s);
            connection.interested(true);
        });
        connection.on("pieces", pieces => console.log("pieces", pieces));
        connection.once("close", () => {
            console.log("closed", server.clients);
        });
    });
    server.once("close", () => {
        console.log("server closed");
        console.log(server.clients);
    });
    process.once("SIGINT", () => {
        server.close();
    });
})();