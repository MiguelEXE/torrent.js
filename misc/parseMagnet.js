const assert = require("assert/strict");
class Magnet{
    /**
     * Trackers list
     * @type {URL[]}
     */
    trackers
    /**
     * The display name for the file
     * @type {string | undefined}
     */
    displayName
    /**
     * File length of the file
     * @type {number?}
     */
    length
    /**
     * Source for that file, aka a HTTP download
     * @type {string?}
     */
    originalSource
    /**
     * Keywords/tags for that torrent
     * @type {string[]}
     */
    keywords
    /**
     * Info hash
     * @type {Buffer}
     */
    info
}
/**
 * Parses a BitTorrent (v1) [Magnet URI](https://en.wikipedia.org/wiki/Magnet_URI_scheme)
 * @param {string | URL} magnetURI The magnet URI
 * @returns {Magnet} The parsed magnet
 */
function parse_magnetURL(magnetURI){
    let magnetParsed;
    if(magnetURI.constructor === URL){
        magnetParsed = magnetURI;
    }else if(typeof magnetURI === "string"){
        magnetParsed = new URL(magnetURI);
    }else{
        throw new TypeError("magnetURI is not a string or a URL");
    }

    const trackers = magnetParsed.searchParams.getAll("tr")?.map(tracker => new URL(tracker));
    const displayName = magnetParsed.searchParams.get("dn");
    const length = magnetParsed.searchParams.get("xl");
    const [constant_urn, infoHashType, hash] = magnetParsed.searchParams.get("xt")?.split(":") || [];
    assert.deepStrictEqual(constant_urn, "urn", new Error("constant_urn not equals urn"));
    assert.deepStrictEqual(infoHashType, "btih", new Error("info hash type is not btih"));

    const originalSource = magnetParsed.searchParams.get("as");
    const keywords = magnetParsed.searchParams.get("kt")?.split(" ") || [];
    return {
        trackers,
        displayName,
        length,
        originalSource,
        keywords,
        infoHash: Buffer.from(hash, "hex")
    }
}
module.exports = parse_magnetURL;