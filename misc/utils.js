const crypto = require("crypto");
const net = require("net");

function isPortFree(port){
    return new Promise(r => {
        const server = net.createServer();
        server.once("error", () => {
            r(false);
        });
        server.once("listening", () => {
            server.close();
            r(true);
        });
        server.listen(port);
    });
}
class Enums{
    static base_peer_id = `-XXYYYY-`;
    /**
     * 
     * @param {String} base_peer_name 
     * @param {number} version 
     * @returns 
     */
    static generate_peer_id(base_peer_name, version){ // Azureus-style
        const base_peer_id = Buffer.from(this.base_peer_id.replace(/XX/, base_peer_name).replace(/YYYY/g, version.toString().padStart(4, "0")));
        const peer_id = crypto.randomBytes(20);
        base_peer_id.copy(peer_id);
        return peer_id;
    }

    static async find_port(){
        for(let port=6881;port<6890;port++){
            const free = await isPortFree(port);
            if(free) return port;
        }
    }
}
module.exports = Enums;