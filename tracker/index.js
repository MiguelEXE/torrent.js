const assert = require("assert/strict");
const enums = require("../misc/utils.js");
const Peer = require("./peer.js");
const events = require("events");

const protocols = {
    http: require("./protocols/http.js"),
    udp: require("./protocols/udp.js")
};
class TrackerOptions{
    /**
     * A identification of this client. Custom `peer_id`, can be generated on [enums.js](../misc/enums.js)
     * @type {Buffer?}
     */
    peerId
    /**
     * The SHA-1 of the torrent info
     * @type {Buffer}
     */
    infoHash
    /**
     * The port that the client is listening
     * @type {number}
     */
    port
    /**
     * URL of the tracker (use `udp://` to udp trackers)
     * @type {URL | string}
     */
    url

    /**
     * To avoid race condition (with `announceLoop()`). This will write the `tracker.left` before `#announceLoop()` starts.
     * @type {Number?}
     */
    left
    /**
     * To avoid race condition (with `announceLoop()`). This will write the `tracker.downloaded` before `#announceLoop()` starts.
     * @type {Number?}
     */
    downloaded
    /**
     * To avoid race condition (with `announceLoop()`). This will write the `tracker.uploaded` before `#announceLoop()` starts.
     * @type {Number?}
     */
    uploaded
}
class ScrapeFile{
    /**
     * Quantity of peers seeding (uploading but not downloading) this file
     * @type {number}
     */
    seeders
    /**
     * Quantity of peers leeching (downloading but not seeding) this file
     * @type {number}
     */
    leechers
    /**
     * Quantity of peers that downloaded this file
     * @type {number}
     */
    completed
}
class ScrapeResult{
    /**
     * @type {ScrapeFile}
     */
    file
    /**
     * Minimal interval to send another scrape. Not respecting this value can result a ip-ban in the tracker.
     * @type {number}
     */
    min_request
}
class Tracker extends events.EventEmitter{
    /**
     * @type {Peer[]}
     */
    #peers = []
    /**
     * @type {Buffer}
     */
    #info_hash
    /**
     * @type {Buffer}
     */
    #tracker_id
    /**
     * @type {Buffer}
     */
    #peer_id

    /**
     * @type {number}
     */
    #client_port

    /**
     * @type {"started" | "completed" | "stopped" | "empty"}
     */
    #event = "started"

    #interval = 1000
    #protocol

    /**
     * Read-Write. Total of bytes the client downloaded
     * @type {number}
     */
    downloaded = 0
    /**
     * Read-Write. Total of bytes the client uploaded
     * @type {number}
     */
    uploaded = 0
    /**
     * Read-Write. Total of bytes the client needs to download
     * @type {number}
     */
    left = 0
    /**
     * @type {boolean}
     */
    #stopped = false

    /**
     * Returned array of peers in the last announce
     * @type {Peer[]}
     * @constant
     */
    get peers(){
        return Array.from(this.#peers);
    }
    get peerId(){
        return this.#peer_id;
    }

    async #announce(){
        if(this.#stopped) return;
        const result = await this.#protocol.announce({
            info_hash: this.#info_hash,
            event: this.#event,
            peer_id: this.#peer_id,
            port: this.#client_port,
            left: this.left,
            downloaded: this.downloaded,
            uploaded: this.uploaded,
            tracker_id: this.#tracker_id
        });
        if(!result) return;
        const newPeersList = [];
        for(const peer of result.peers){
            const peerClass = new Peer(peer.ip, peer.port);
            newPeersList.push(peerClass);
            this.emit("peer", peerClass);
        }
        
        this.#peers = newPeersList;
        this.#event = "empty";
        this.#interval = result.interval * 1000;
        this.#tracker_id = result.tracker_id;
    }
    /**
     * Sents a last announce and makes the client stops announcing the tracker. After calling this this `Tracker` object will become useless
     */
    async stop(){
        if(this.#stopped) throw new Error("Use after stop.");
        this.#event = "stopped";
        clearInterval(this.#interval);
        this.#interval = undefined;
        while(true){
            const ok = await this.#announce();
            if(!ok) break;
        }
        this.#stopped = true;
        this.#peers = [];
    }
    /**
     * Sents to tracker that the client finished downloading the torrent
     */
    async complete(){
        if(this.#stopped) throw new Error("Use after stop.");
        this.#event = "completed";
        while(true){
            const ok = await this.#announce();
            if(ok) break;
        }
    }
    async #announceLoop(){
        if(this.#stopped) return;
        await this.#announce();
        setTimeout(() => {
            this.#announceLoop();
        }, this.#interval);
    }
    /**
     * Initializes a tracker client
     * @param {TrackerOptions} options Tracker options
     */
    constructor(options){
        super();
        assert.ok(Buffer.isBuffer(options.infoHash), new TypeError("options.infoHash is not a Buffer"));
        assert.deepStrictEqual(options.infoHash.byteLength, 20, "options.infoHash needs to have a length of 20 bytes");

        if(options.peerId === undefined){
            options.peerId = enums.generate_peer_id("js", 1);
        }else{
            assert.ok(Buffer.isBuffer(options.peerId), new TypeError("options.peerId is not a Buffer"));
            assert.deepStrictEqual(options.peerId.byteLength, 20, "options.peerId needs to have a length of 20 bytes");
        }

        let protocolStr;
        let optURL;
        assert.notDeepStrictEqual(options.url, undefined, new TypeError("options.url is not a URL or a string"));
        if(options.url.constructor === URL){
            optURL = options.url;
            const protocol = optURL.protocol.slice(0,-1);
            protocolStr = protocol;

        }else if(typeof options.url === "string"){
            optURL = new URL(options.url);
            const protocol = optURL.protocol.slice(0,-1);
            protocolStr = protocol;
        }else{
            throw new TypeError("options.url is not a URL or a string");
        }

        if(options.downloaded !== undefined){
            assert.deepStrictEqual(typeof options.downloaded, "number", new TypeError("options.downloaded is not a number"));
            this.downloaded = options.downloaded;
        }

        if(options.uploaded !== undefined){
            assert.deepStrictEqual(typeof options.uploaded, "number", new TypeError("options.uploaded is not a number"));
            this.uploaded = options.uploaded;
        }

        if(options.left !== undefined){
            assert.deepStrictEqual(typeof options.left, "number", new TypeError("options.left is not a number"));
            this.left = options.left;
        }

        this.#client_port = options.port;
        this.#peer_id = options.peerId;
        this.#info_hash = options.infoHash;
        this.#protocol = new protocols[protocolStr](optURL);
        this.#announceLoop(); 
    }
    /**
     * Returns a scrape result (quantity of peers in the tracker network). Can return undefined if it is not connected to the tracker yet (UDP-only)
     * @returns {Promise<ScrapeResult>} Scrape result
     */
    async scrape(){
        return await this.#protocol.scrape(this.#info_hash);
    }
}

module.exports = Tracker;