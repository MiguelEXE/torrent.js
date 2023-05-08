require("fs")
const INT_MAGIC = 0x69;
const LIST_MAGIC = 0x6C;
const DICTIONARY_MAGIC = 0x64;
const END_MAGIC = 0x65;
/**
 * 
 * @param {Buffer} buf 
 */
function decodeInteger(buf){
    if(buf[0] !== INT_MAGIC) throw new Error("Not a integer");
    const intIndex = buf.indexOf("e");
    return {
        value: parseInt(buf.subarray(1,intIndex).toString("ascii")),
        next: intIndex+1,
        originalBuffer: buf.subarray(0, intIndex+1)
    };
}
/**
 * 
 * @param {Buffer} buf 
 */
function decodeString(buf){
    const sep = buf.indexOf(":");
    const num = parseInt(buf.subarray(0, sep).toString("ascii"));
    const str = buf.subarray(sep + 1, sep + 1 + num);
    return {
        value: str,
        next: sep + 1 + num,
        originalBuffer: buf.subarray(sep + 1 + num)
    }
}

/**
 * 
 * @param {Buffer} buf 
 */
function decodeList(buf){
    if(buf[0] !== LIST_MAGIC) throw new Error("Not a list");
    const list = [];
    let pointer = 1;
    while(buf[pointer] !== END_MAGIC){
        const {value, next} = decodeAnyType(buf.subarray(pointer));
        pointer += next;
        list.push(value);
    }
    pointer++;
    return {
        value: list,
        next: pointer,
        originalBuffer: buf.subarray(0, pointer)
    }
}
/**
 * 
 * @param {Buffer} buf 
 */
function decodeDict(buf){
    if(buf[0] !== DICTIONARY_MAGIC) throw new Error("Not a dictionary");
    const dict = {};
    let pointer = 1;
    while(buf[pointer] !== END_MAGIC){
        const {value: key, next: next1} = decodeAnyType(buf.subarray(pointer));
        pointer += next1;
        const {value, next: next2} = decodeAnyType(buf.subarray(pointer));
        pointer += next2;
        dict[key] = value;
    }
    pointer++;
    dict.originalBuffer = buf.subarray(0,pointer);
    return {
        value: dict,
        next: pointer
    };
}
/**
 * Decodes bencode
 * @param {Buffer} buf 
 */
function decodeAnyType(buf){
    switch(buf[0]){
        case INT_MAGIC:
            return decodeInteger(buf);
        case LIST_MAGIC:
            return decodeList(buf);
        case DICTIONARY_MAGIC:
            return decodeDict(buf);
        default:
            return decodeString(buf);
    }
}
/**
 * Decodes bencode
 * @param {*} buf 
 */
function decode(buf){
    return decodeAnyType(buf).value;
}
module.exports = decode;