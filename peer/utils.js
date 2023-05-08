const {SmartBuffer} = require("smart-buffer");
const pstr = Buffer.from("BitTorrent protocol","ascii");
const pstrlen = pstr.byteLength;
const MAXIUM_SIZE = 2 ** 14;

class ConnectionError extends Error{}
class ConnectionState{
    /**
     * If me (client) is choking. If you're seeding, unchoke the peer which will gonna download.
     * @type {boolean}
     */
    me_choking
    /**
     * If me (client) is interested on downloading stuff. If you're a leecher (downloaded), send a interest message to notify the peer that you're gonna download.
     * @type {boolean}
     */
    me_interested
    /**
     * If the other peer is choking. Do not attempt to send a piece request if the peer is choking
     * @type {boolean}
     */
    peer_choking
    /**
     * If the other peer is interested on downloading stuff.
     * @type {boolean}
     */
    peer_interested
}
/**
 * Creates a handshake message
 * @param {Buffer} info_hash Info hash
 * @param {Buffer} peer_id Peer id
 * @returns {Buffer} The handshake
 */
function createHandshake(info_hash, peer_id){
    const buf = new SmartBuffer({
        size: 49+pstrlen
    });
    buf.writeUInt8(pstrlen);
    buf.writeBuffer(pstr);
    buf.writeBigInt64BE(0n);
    buf.writeBuffer(info_hash);
    buf.writeBuffer(peer_id);
    return buf.toBuffer();
}
/**
 * Checks for equality on both buffers
 * @param {Buffer} b1 Buffer 1
 * @param {Buffer} b2 Buffer 2
 * @returns {boolean} If the two buffers are equal
 */
function verifyBuffer(b1,b2){
    for(let i=0;i<Math.max(b1.byteLength, b2.byteLength);i++){
        if(b1[i] !== b2[i]) return false;
    }
    return true;
}
class Peer{
    infoHash
    peerId

    me_choking = true
    me_interested = false
    peer_choking = true
    peer_interested = false
}
module.exports = {Peer, createHandshake, pstr, pstrlen, MAXIUM_SIZE, ConnectionError, ConnectionState, verifyBuffer};