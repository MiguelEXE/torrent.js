const net = require("net");
const peerUtils = require("./utils.js");
const assert = require("assert/strict");
const {SmartBuffer} = require("smart-buffer");
const {EventEmitter} = require("events");

class PeerClientOptions{
    /**
     * @type {String} IP of the target peer
     */
    host
    /**
     * @type {number} Port of the target peer
     */
    port
    /**
     * @type {Buffer} The SHA-1 of the torrent info
     */
    infoHash
    /**
     * @type {Buffer} A identification of this client.
     */
    peerId
}

class PeerClient extends EventEmitter{
    /**
     * @type {net.Socket}
     */
    #connection
    #handshaked = false
    #info = new peerUtils.Peer() // hacky abstract way of representing a peer, i know its not clean code but whatever
    /**
     * Peer (server) id (in other words, the peer id of the server that we are connecting)
     * @type {Buffer}
     */
    get peerId(){
        return this.#info.peerId;
    }
    #pieces = []
    /**
     * Initializes a peer connection
     * @param {PeerClientOptions} options Peer options
     */
    constructor(options){
        super();
        assert.deepStrictEqual(typeof options.host, "string", new TypeError("options.host is not a string"));

        assert.ok(!isNaN(options.port), "options.port is Not a Number");
        assert.ok(options.port > 0, "options.port is not a valid port");
        assert.ok(options.port < 65535, "options.port is not a valid port");

        assert.ok(Buffer.isBuffer(options.peerId), new TypeError("options.peerId is not a Buffer"));
        assert.deepStrictEqual(options.peerId.byteLength, 20, "options.peerId needs to have a length of 20 bytes");

        assert.ok(Buffer.isBuffer(options.infoHash), new TypeError("options.infoHash is not a Buffer"));
        assert.deepStrictEqual(options.infoHash.byteLength, 20, "options.infoHash needs to have a length of 20 bytes");

        this.#connection = net.createConnection({
            host: options.host,
            port: options.port
        });
        const handshake = peerUtils.createHandshake(options.infoHash, options.peerId);
        this.#connection.once("connect", () => {
            this.#connection.write(handshake);
        });
        this.#connection.once("error", () => {
            this.#connection.end(); // if connection isnt closed (rare stuff i think), close it
            this.emit("error", new peerUtils.ConnectionError("Connection abruptly closed"));
        });
        this.#connection.once("close", () => {
            this.emit("destroyed");
        });
        this.#connection.on("data", data => {
            const buf = SmartBuffer.fromBuffer(data);
            if(!this.#handshaked){
                const pstrlen_remote = buf.readUInt8();
                if(pstrlen_remote !== peerUtils.pstrlen){
                    this.#connection.end();
                    return this.emit("error", new peerUtils.ConnectionError("Handshake error"));
                }
                const pstr_remote = buf.readString(peerUtils.pstrlen, "ascii");
                if(pstr_remote !== peerUtils.pstr.toString("ascii")){
                    this.#connection.end();
                    return this.emit("error", new peerUtils.ConnectionError("Handshake error"));
                }
                const extensions = buf.readBigInt64BE();
                if(extensions !== 0n){
                    this.emit("warn", "Extension bytes are not 0");
                }
                const remote_info_hash = buf.readBuffer(20);
                if(!peerUtils.verifyBuffer(options.infoHash, remote_info_hash)){
                    this.#connection.end();
                    return this.emit("error", new peerUtils.ConnectionError("Handshake error"));
                }
                this.#info.infoHash = options.infoHash;
                const remote_peer_id = buf.readBuffer(20);
                this.#info.peerId = remote_peer_id;
                this.#handshaked = true;
                return this.emit("ready");
            }
            this.#onMessage(buf);
        });
    }
    /**
     * Sends a `keepAlive` opcode. Used to test is the server is properly responding to the messages
     */
    keepAlive(){
        this.#connection.write(Buffer.alloc(4));
    }
    /**
     * Closes the connection
     */
    close(){
        this.#connection.end();
    }
    choking(val){
        assert.ok(!this.#connection.closed, new Error("connection closed"));
        assert.ok(this.#handshaked, new Error("wait for handshake to conclude"));
        const buf = new SmartBuffer({
            size: 5
        });
        buf.writeUInt32BE(1);
        if(val){
            buf.writeUInt8(0);
        }else{
            buf.writeUInt8(1);
        }
        this.#info.me_choking = val;
        this.#connection.write(buf.toBuffer());
    }
    interested(val){
        assert.ok(!this.#connection.closed, new Error("connection closed"));
        assert.ok(this.#handshaked, new Error("wait for handshake to conclude"));
        const buf = new SmartBuffer({
            size: 5
        });
        buf.writeUInt32BE(1);
        if(val){
            buf.writeUInt8(2);
        }else{
            buf.writeUInt8(3);
        }
        this.#info.me_interested = val;
        this.#connection.write(buf.toBuffer());
    }
    /**
     * Requests a piece to the peer. Note: the piece which will be downloaded will come on a `piece` event
     * @param {number} index Piece index
     * @param {number | undefined} size The size of the piece. Defaults to `2**14`
     * @param {number | undefined} offset The start of the piece. Defaults to 0
     */
    request(index, size, offset){
        assert.ok(!this.#connection.closed, new Error("connection closed"));
        assert.ok(this.#handshaked, new Error("wait for handshake to conclude"));
        assert.ok(!this.#downloading, new Error("The client is downloading a piece"));

        assert.deepStrictEqual(typeof index, "number", new TypeError("index needs to be a number"));
        const pieceExists = this.#pieces.findIndex(p => p === index);
        assert.ok(pieceExists > -1, new RangeError("this piece doesn't exist"));
        if(typeof size === "undefined"){
            size = peerUtils.MAXIUM_SIZE;
        }else{
            assert.deepStrictEqual(typeof size, "number", new TypeError("size needs to be a number"));
            assert.ok(size >= 0, new RangeError("size needs to be bigger or equals 0"));
            assert.ok(size <= peerUtils.MAXIUM_SIZE, new RangeError("size needs to be smaller or equals to 2**14"));
        }
        if(typeof offset === "undefined"){
            offset = 0;
        }else{
            assert.deepStrictEqual(typeof offset, "number", new TypeError("offset needs to be a number"));
            assert.ok(offset >= 0, new RangeError("offset needs to be bigger or equals 0"));
            assert.ok(offset <= peerUtils.MAXIUM_SIZE, new RangeError("offset needs to be smaller or equals to 2**14"));
        }
            
        const buf = new SmartBuffer({
            size: 13+4
        });
        buf.writeUInt32BE(13);
        buf.writeUInt8(6);
        buf.writeUInt32BE(index);
        buf.writeUInt32BE(offset);
        buf.writeUInt32BE(size);
        this.#connection.write(buf.toBuffer());
    }
    /**
     * 
     * @param {Buffer} block The buffer which will be sent
     * @param {number} index The piece index
     * @param {number | undefined} offset The offset of the buffer
     */
    replyPieceRequest(block, index, offset){
        assert.ok(!this.#connection.closed, new Error("connection closed"));
        assert.ok(this.#handshaked, new Error("wait for handshake to conclude"));
        const buf = new SmartBuffer({
            size: 4 + 9 + block.byteLength
        });
        buf.writeUint32BE(9 + block.byteLength);
        buf.writeUint8(7);
        buf.writeUint32BE(index);
        buf.writeUint32BE(offset);
        buf.writeBuffer(block);
        this.#connection.write(buf.toBuffer());
    }
    #downloading = false
    #download_params = {}
    #downloaded_buf

    /**
     * Sends a `bitfield` opcode to the peer, meaning that you have some, none or all pieces. This prevents have spamming
     * @param {boolean[]} pieces Piece indexes 
     */
    _bitfield(pieces){
        assert.ok(!this.#connection.closed, new Error("connection closed"));
        assert.ok(this.#handshaked, new Error("wait for handshake to conclude"));
        const bitfield = new SmartBuffer();
        let j = 0;
        while(!isNaN(pieces[j])){
            let byte = 0;
            for(let i=7;i>0;i--){
                if(pieces[(7 - i) + j]){
                    byte |= 1 << i;
                }
            }
            bitfield.writeUInt8(byte);
            j += 8;
        }
        const bitfieldBuf = bitfield.toBuffer();
        const buf = new SmartBuffer({
            size: 4 + 1 + bitfieldBuf.byteLength
        });
        buf.writeUInt32BE(1 + bitfieldBuf.byteLength);
        buf.writeUInt8(5);
        buf.writeBuffer(bitfieldBuf);
        this.#connection.write(buf.toBuffer());
    }
    /**
     * Same as `_bitfield()` but uses a number array instead of boolean array
     * @param {number[]} pieces Piece indexes
     */
    bitfield(pieces){
        assert.ok(!this.#connection.closed, new Error("connection closed"));
        assert.ok(this.#handshaked, new Error("wait for handshake to conclude"));
        const piecesClone = Array.from(pieces);
        piecesClone.sort();
        const boolean_array = [];
        const largest_piece = piecesClone[piecesClone.length - 1];
        for(let i=0;i<=largest_piece;i++){
            const index = piecesClone.findIndex(p => p === i);
            boolean_array.push(index > -1);
        }
        return this._bitfield(boolean_array);
    }
    /**
     * Sends a `have` opcode to the peer, meaning that you have a piece.
     * @param {number} index Piece index
     */
    have(index){
        assert.ok(!this.#connection.closed, new Error("connection closed"));
        assert.ok(this.#handshaked, new Error("wait for handshake to conclude"));
        assert.deepStrictEqual(typeof index, "number", new TypeError("index is not a number"));
        assert.ok(index >= 0, new RangeError("index needs to be bigger or equals 0"));
        assert.ok(index <= 2 ** 32, new RangeError("index needs to be smaller or equals 2**32"));
        const buf = new SmartBuffer({
            size: 5 + 4
        });
        buf.writeUInt32BE(5);
        buf.writeUInt8(4);
        buf.writeUInt32BE(index);
        this.#connection.write(buf.toBuffer());
    }
    /**
     * Cancels a request of a piece to the peer.
     * @param {number} index Piece index
     * @param {number | undefined} size The size of the piece. Defaults to `2**14`
     * @param {number | undefined} offset The start of the piece. Defaults to 0
     */
    cancel(index, size, offset){
        assert.ok(!this.#connection.closed, new Error("connection closed"));
        assert.ok(this.#handshaked, new Error("wait for handshake to conclude"));
        assert.deepStrictEqual(typeof index, "number", new TypeError("index needs to be a number"));
        const pieceExists = this.#pieces.findIndex(p => p === index);
        assert.ok(pieceExists > -1, new RangeError("this piece doesn't exist"));
        if(typeof size === "undefined"){
            size = peerUtils.MAXIUM_SIZE;
        }else{
            assert.deepStrictEqual(typeof size, "number", new TypeError("size needs to be a number"));
            assert.ok(size >= 0, new RangeError("size needs to be bigger or equals 0"));
            assert.ok(size <= peerUtils.MAXIUM_SIZE, new RangeError("size needs to be smaller or equals to 2**14"));
        }
        if(typeof offset === "undefined"){
            offset = 0;
        }else{
            assert.deepStrictEqual(typeof offset, "number", new TypeError("offset needs to be a number"));
            assert.ok(offset >= 0, new RangeError("offset needs to be bigger or equals 0"));
            assert.ok(offset <= peerUtils.MAXIUM_SIZE, new RangeError("offset needs to be smaller or equals to 2**14"));
        }
            
        const buf = new SmartBuffer({
            size: 13+4
        });
        buf.writeUInt32BE(13);
        buf.writeUInt8(6);
        buf.writeUInt32BE(index);
        buf.writeUInt32BE(offset);
        buf.writeUInt32BE(size);
        this.#downloading = false;
        this.#download_params = undefined;
        this.#connection.write(buf.toBuffer());
    }
    /**
     * 
     * @param {SmartBuffer} buf 
     */
    #onMessage(buf){
        if(this.#downloading){
            const data = buf.readBuffer();
            this.#download_params.left -= data.byteLength;
            const downloaded_smartbuf = SmartBuffer.fromBuffer(this.#downloaded_buf);
            downloaded_smartbuf.insertBuffer(data, this.#downloaded_buf.byteLength);
            this.#downloaded_buf = downloaded_smartbuf.toBuffer();
            if((this.#download_params.left-this.#download_params.offset) <= 0){
                this.#download_params = undefined;
                this.#downloading = false;
            }
            return this.emit("piece", this.#downloaded_buf);
        }
        const length = buf.readUInt32BE();
        if(length < 1){ // keep-alive
            this.keepAlive();
            this.emit("keepAlive");
        }else{ // opcode
            const opcode = buf.readUInt8();
            console.log(opcode, length);
            switch(opcode){
                case 0:
                    this.#info.peer_choking = true;
                    break;
                case 1:
                    this.#info.peer_choking = false;
                    break;
                case 2:
                    this.#info.peer_interested = true;
                    break;
                case 3:
                    this.#info.peer_interested = false;
                    break;
                case 4:
                    const piece = buf.readUInt32BE();
                    const alreadyExistingPiece = this.#pieces.findIndex(p => p === piece);
                    if(alreadyExistingPiece > -1) return; // already exists
                    this.#pieces.push(piece);
                    this.#pieces.sort();
                    this.emit("pieces", Array.from(this.#pieces));
                    break;
                case 5:
                    const toRead = length - 1;
                    const pieces = [];
                    let j=0;
                    while(j < toRead){
                        const byte = buf.readUInt8();
                        for(let i=7;i>0;i--){
                            if((byte & (1 << i)) > 0){
                                pieces.push((7 - i)+j);
                            }
                        }
                        j++;
                    }
                    this.#pieces = pieces;
                    this.emit("pieces", Array.from(this.#pieces));
                    break;
                case 6:
                    const index_peer = buf.readUInt32BE();
                    const offset_peer = buf.readUInt32BE();
                    const size_peer = buf.readUInt32BE();
                    this.emit("request", {
                        index: index_peer,
                        offset: offset_peer,
                        size: size_peer
                    });
                    break;
                case 7:
                    const index = buf.readUInt32BE();
                    const offset = buf.readUInt32BE();
                    this.#downloading = true;
                    this.#download_params = {index, offset, left: length-13};
                    this.#downloaded_buf = buf.readBuffer();
                    this.#download_params.left -= this.#downloaded_buf.byteLength;
                    if(this.#download_params.left <= 0){
                        this.#downloading = false;
                        this.#download_params = {};
                        this.emit("piece", this.#downloaded_buf);
                    }
                    break;
                case 8:
                    const index_cancel = buf.readUInt32BE();
                    const offset_cancel = buf.readUInt32BE();
                    const size_cancel = buf.readUInt32BE();
                    this.emit("cancel", {
                        index: index_cancel,
                        offset: offset_cancel,
                        size: size_cancel
                    });
                    break;
                default:
                    this.emit("error", new Error("Invalid opcode"));
            }
            if(opcode <= 3){
                this.emit("state", {
                    me_choking: this.#info.me_choking,
                    me_interested: this.#info.me_interested,
                    peer_choking: this.#info.peer_choking,
                    peer_interested: this.#info.peer_interested
                });
            }
        }
    }
    /**
     * Choking and interest status
     * @type {peerUtils.ConnectionState}
     */
    get state(){
        return {
            me_choking: this.#info.me_choking,
            me_interested: this.#info.me_interested,
            peer_choking: this.#info.peer_choking,
            peer_interested: this.#info.peer_interested
        }
    }
    /**
     * Allowed indexes of the `request()` call
     * @type {number[]}
     */
    get peer_pieces_indexes(){
        return Array.from(this.#pieces);
    }
}
module.exports = PeerClient;