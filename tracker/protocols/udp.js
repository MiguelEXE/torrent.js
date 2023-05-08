const dgram = require("dgram");
const {SmartBuffer} = require("smart-buffer");
const crypto = require("crypto");

const protocol_id = 0x41727101980n;
const actions = {
    connect: 0,
    announce: 1,
    scrape: 2,
    errror: 4
};
const events = {
    empty: 0,
    completed: 1,
    started: 2,
    stopped: 3
};
const nextTick = () => new Promise(r => setTimeout(r,10));
module.exports = class UDPTracker{
    /**
     * @type {BigInt}
     */
    connection_id
    url
    port
    
    timeout
    client

    messageList = []
    n = 0
    onReceive(action, data){
        const buf = data;
        if(action === actions.connect){
            return this.connection_id = buf.readBigInt64BE();
        }else if(action === actions.announce){
            const interval = buf.readInt32BE();
            const leechers = buf.readInt32BE();
            const seeders = buf.readInt32BE();
            const unparsedPeers = buf.readBuffer();
            const parsedPeers = [];
            for(let i=0;i<unparsedPeers.byteLength;i+=6){
                const peer = unparsedPeers.subarray(i, i+6);
                const ip = `${peer[0]}.${peer[1]}.${peer[2]}.${peer[3]}`;
                const port = peer.readUInt16BE(4);
                parsedPeers.push({ip, port});
            }
            return {interval, peers: parsedPeers, leechers, seeders};
        }else if(action === actions.scrape){
            const seeders = buf.readInt32BE();
            const completed = buf.readInt32BE();
            const leechers = buf.readInt32BE();
            return {file: {seeders, completed, leechers}, min_interval: 0};
        }
    }
    
    iterate(){
        if(this.messageList.length < 1) return true;
        return new Promise(r => {
            const [id, action, data, transaction_id, callback] = this.messageList[0];
            const buf = new SmartBuffer();
            if(!id){
                this.messageList.splice(0,1); // ignore
                return callback(false);
            }
            buf.writeBigInt64BE(BigInt(id));
            buf.writeInt32BE(action);
            buf.writeInt32BE(transaction_id);
            buf.writeBuffer(data);
            this.client.send(buf.toBuffer(), this.port, this.host);

            this.client.once("message", data => {
                const buf = SmartBuffer.fromBuffer(data);
                const resAction = buf.readInt32BE();
                const resTransaction = buf.readInt32BE();

                if(transaction_id !== resTransaction) return;
                clearTimeout(this.timeout);
                this.n = 0;
                this.messageList.splice(0,1);
                callback?.({action: resAction, data: buf});
                r(true);
            });
            this.timeout = setTimeout(function(){
                r(false);
            }, 15000 * 2 ** this.n++);
        });
    }
    reconnect(){
        this.messageList.forEach(function(message){
            message[4]?.(false);
        });
        this.send(protocol_id, actions.connect, Buffer.alloc(0));
    }
    async loop(){
        while(true){
            await nextTick();
            const ok = await this.iterate();
            if(!ok){
                this.reconnect();
            }
        }
    }
    async send(id, action, data){
        const response = await new Promise(r => {
            this.messageList.push([id, action, data, crypto.randomBytes(4).readInt32BE(), r]);
        });
        if(!response) return
        return this.onReceive(response.action, response.data);
    }
    announce(options){
        if(!this.connection_id) return;
        const buf = new SmartBuffer();
        buf.writeBuffer(options.info_hash);
        buf.writeBuffer(options.peer_id);
        buf.writeBigInt64BE(BigInt(options.downloaded));
        buf.writeBigInt64BE(BigInt(options.left));
        buf.writeBigInt64BE(BigInt(options.uploaded));
        buf.writeInt32BE(events[options.event]);
        buf.writeInt32BE(0); // ip is ignored, sent a issue if you need this implemented
        buf.writeInt32BE(0); // idk what key does
        buf.writeInt32BE(-1);
        buf.writeInt16BE(options.port);
        return this.send(this.connection_id, 1, buf.toBuffer());
    }
    scrape(info_hash){
        if(!this.connection_id) return;
        return this.send(this.connection_id, 2, info_hash);
    }
    constructor(url){
        this.host = url.hostname;
        this.port = url.port;
        this.client = dgram.createSocket({
            type: "udp4"
        });
        this.loop();
        this.reconnect();
    }
}