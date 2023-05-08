class Peer{
    /**
     * @type {string}
     */
    #ip
    /**
     * @type {number}
     */
    #port
    get ip(){
        return this.#ip;
    }
    get port(){
        return this.#port;
    }
    constructor(ip, port){
        this.#ip = ip;
        this.#port = port;
    }
}
module.exports = Peer;