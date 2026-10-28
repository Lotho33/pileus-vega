// Must be the first import of index.js. @bufbuild/protobuf's wire format
// needs TextEncoder AND TextDecoder on globalThis. Hermes on Vega ships
// TextEncoder but not TextDecoder — and the usual polyfill
// (fastestsmallesttextencoderdecoder) installs nothing when TextEncoder is
// already there, so we install our own UTF-8 decoder.

class Utf8Decoder {
  readonly encoding = 'utf-8';
  readonly fatal: boolean;

  constructor(label = 'utf-8', options: {fatal?: boolean} = {}) {
    if (!/^utf-?8$/i.test(label)) {
      throw new RangeError(`TextDecoder: unsupported encoding ${label}`);
    }
    this.fatal = !!options.fatal;
  }

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    return decodeUtf8(toBytes(input), this.fatal);
  }
}

function toBytes(input?: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (!input) {
    return new Uint8Array(0);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

export function decodeUtf8(b: Uint8Array, fatal = false): string {
  const out: number[] = [];
  let s = '';
  const bad = () => {
    if (fatal) {
      throw new TypeError('TextDecoder: invalid UTF-8');
    }
    out.push(0xfffd);
  };
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    let cp = -1;
    let need = 0;
    let min = 0;
    if (c < 0x80) {
      cp = c;
    } else if (c >= 0xc2 && c <= 0xdf) {
      cp = c & 0x1f;
      need = 1;
      min = 0x80;
    } else if (c >= 0xe0 && c <= 0xef) {
      cp = c & 0x0f;
      need = 2;
      min = 0x800;
    } else if (c >= 0xf0 && c <= 0xf4) {
      cp = c & 0x07;
      need = 3;
      min = 0x10000;
    }
    if (cp < 0) {
      bad();
      i++;
      continue;
    }
    let j = 1;
    for (; j <= need; j++) {
      const n = b[i + j];
      if (n === undefined || (n & 0xc0) !== 0x80) {
        break;
      }
      cp = (cp << 6) | (n & 0x3f);
    }
    if (j <= need || cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      bad();
      i += j; // skip the lead byte plus any valid continuation bytes
      continue;
    }
    i += need + 1;
    if (cp > 0xffff) {
      cp -= 0x10000;
      out.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out.push(cp);
    }
    if (out.length > 8192) {
      s += String.fromCharCode(...out);
      out.length = 0;
    }
  }
  return s + String.fromCharCode(...out);
}

const g = globalThis as {TextDecoder?: unknown};
if (typeof g.TextDecoder === 'undefined') {
  g.TextDecoder = Utf8Decoder;
}
