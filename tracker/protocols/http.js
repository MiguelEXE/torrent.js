const urlEncodeBytes = require("../../misc/encodeURL.js");
const bdecode = require("../../misc/bdecode.js");
module.exports = class HTTPTracker{
    url
    /**
     * 
     * @param {URL} url 
     */
    constructor(url){
        this.url = url;
    }
    async announce(options){
        const responseFetch = await fetch(`${this.url.toString()}?info_hash=${urlEncodeBytes(options.info_hash)}&event=${options.event}&peer_id=${urlEncodeBytes(options.peer_id)}&port=${options.port}&left=${options.left}&downloaded=${options.downloaded}&uploaded=${options.uploaded}&compact=1&trackerid=${options.tracker_id}`);
        const blob = await responseFetch.blob();
        const arrBuf = await blob.arrayBuffer();
        const response = Buffer.from(arrBuf);
        const bdecoded = bdecode(response);
        if(bdecoded["failure reason"]) throw new Error(bdecoded["failure reason"]);
        const peers = bdecoded.peers;
        const parsedPeers = [];
        for(let i=0;i<peers.length;i+=6){
            const peer = peers.subarray(i, i+6);
            const ip = `${peer[0]}.${peer[1]}.${peer[2]}.${peer[3]}`;
            const port = peer.readUint16BE(4);
            parsedPeers.push({ip, port});
        }
        return {interval: bdecoded.interval, peers: parsedPeers, tracker_id: bdecoded["tracker id"]};
    }
    async scrape(info_hash){
        const url = this.url.toString().replace(/announce/, "scrape");
        const responseFetch = await fetch(`${url}?info_hash=${urlEncodeBytes(info_hash)}`);
        const blob = await responseFetch.blob();
        const arrBuf = await blob.arrayBuffer();
        const response = Buffer.from(arrBuf);
        const bdecoded = bdecode(response);
        let file;
        for(const info_hash in bdecoded.files){ // hacky way to get the first entry. idk why info_hash.toString doesnt work
            file = bdecoded.files[info_hash];
            break;
        }
        file = {
            completed: file.complete,
            seeders: file.downloaded,
            leechers: file.incomplete
        };
        return {
            file,
            min_interval: bdecoded?.flags?.min_request_interval || 0
        };
    }
}