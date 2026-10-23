export const MAINNET_MAGIC = Buffer.from([0xf9, 0xbe, 0xb4, 0xd9]);
export const TESTNET_MAGIC = Buffer.from([0x0b, 0x11, 0x09, 0x07]);

export const HEADER_SIZE = 24;
export const PROTOCOL_VERSION = 70016;
/** Peers below this version ignore `sendaddrv2` (BIP 155). */
export const ADDRV2_MIN_PROTOCOL_VERSION = 70016;

export const COMMAND_VERSION = "version";
export const COMMAND_VERACK = "verack";
export const COMMAND_FEEFILTER = "feefilter";
export const COMMAND_GETADDR = "getaddr";
export const COMMAND_ADDR = "addr";
export const COMMAND_SENDADDRV2 = "sendaddrv2";
export const COMMAND_ADDRV2 = "addrv2";
