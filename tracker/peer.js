class Peer{
    /**
     * @type {string}
     */
    #ip
    /**
     * @type {number}
     */
    #port
    /**
     * The ip of the peer
     * @type {string}
     */
    get ip(){
        return this.#ip;
    }
    /**
     * The port of the peer
     * @type {number}
     */
    get port(){
        return this.#port;
    }
    constructor(ip, port){
        this.#ip = ip;
        this.#port = port;
    }
}
module.exports = Peer;