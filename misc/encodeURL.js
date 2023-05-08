// https://stackoverflow.com/questions/57873879/buffers-and-url-encoding-in-node-js
const isUrlSafe = char => {
    return /[a-zA-Z0-9\-_~.]+/.test(char);
}
  
const urlEncodeBytes = buf => {
    let encoded = "";
    for (let i=0;i<buf.length;i++){
        const charBuf = Buffer.from("00", 'hex');
        charBuf.writeUInt8(buf[i]);
        const char = charBuf.toString();
        // if the character is safe, then just print it, otherwise encode
        if (isUrlSafe(char)){
            encoded += char;
        }else{
            encoded += `%${charBuf.toString('hex').toUpperCase()}`;
        }
    }
    return encoded;
}
module.exports = urlEncodeBytes;