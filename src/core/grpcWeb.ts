// gRPC-Web client over XMLHttpRequest — the Vega counterpart of
// pileus-player's NativeGrpcWebClientChannel, talking to mycelium-core's
// grpcweb.go bridge at `<origin>/grpc/<pkg.Service>/<Method>`.
//
// XHR rather than fetch: React Native's fetch is itself a polyfill on top of
// XHR and goes through Blob/FileReader to hand back an ArrayBuffer, while XHR
// with responseType "arraybuffer" gets the bytes directly, plus abort and a
// real timeout.
//
// Server-streaming RPCs (ResolveStream) come back as one buffered body: RN's
// XHR doesn't expose partial binary bodies, so every frame is decoded once
// the server closes the stream. Progress events are lost, the final result
// is not.

import type {BinaryWriter} from '@bufbuild/protobuf/wire';

export interface MessageCodec<T> {
  encode(message: T, writer?: BinaryWriter): BinaryWriter;
  decode(input: Uint8Array): T;
  fromPartial(object: any): T;
}

/** Subset of grpc status codes the app actually branches on. */
export const GrpcStatus = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  UNAUTHENTICATED: 16,
} as const;

export class GrpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message || `gRPC status ${code}`);
    this.name = 'GrpcError';
  }
}

export interface CallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type MetadataProvider = () => Record<string, string>;

const FRAME_DATA = 0x00;
const FRAME_TRAILER = 0x80;

function frame(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  out[0] = FRAME_DATA;
  new DataView(out.buffer).setUint32(1, payload.length, false);
  out.set(payload, 5);
  return out;
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

function parseTrailers(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\r\n')) {
    const i = line.indexOf(':');
    if (i > 0) {
      out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return out;
}

/** Splits a gRPC-Web body into its data payloads and the trailer frame. */
export function decodeFrames(body: Uint8Array): {
  messages: Uint8Array[];
  trailers: Record<string, string>;
} {
  const messages: Uint8Array[] = [];
  let trailers: Record<string, string> = {};
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let pos = 0;
  while (pos + 5 <= body.length) {
    const flag = body[pos];
    const len = view.getUint32(pos + 1, false);
    const start = pos + 5;
    const end = start + len;
    if (end > body.length) {
      throw new GrpcError(GrpcStatus.INTERNAL, 'gRPC-Web: frame troncato');
    }
    const chunk = body.subarray(start, end);
    if (flag & FRAME_TRAILER) {
      trailers = {...trailers, ...parseTrailers(latin1(chunk))};
    } else {
      messages.push(chunk);
    }
    pos = end;
  }
  return {messages, trailers};
}

function decodeGrpcMessage(raw: string | undefined): string {
  if (!raw) {
    return '';
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function statusFrom(
  trailers: Record<string, string>,
  headers: Record<string, string>,
): {code: number; message: string} | null {
  // Trailers-only responses (an error before any message) put the status in
  // the HTTP headers instead of a trailer frame.
  const rawCode = trailers['grpc-status'] ?? headers['grpc-status'];
  if (rawCode === undefined) {
    return null;
  }
  return {
    code: Number(rawCode),
    message: decodeGrpcMessage(
      trailers['grpc-message'] ?? headers['grpc-message'],
    ),
  };
}

function parseResponseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const i = line.indexOf(':');
    if (i > 0) {
      out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return out;
}

function httpStatusToGrpc(status: number): number {
  switch (status) {
    case 400:
      return GrpcStatus.INTERNAL;
    case 401:
      return GrpcStatus.UNAUTHENTICATED;
    case 403:
      return GrpcStatus.PERMISSION_DENIED;
    case 404:
      return GrpcStatus.UNIMPLEMENTED;
    case 429:
    case 502:
    case 503:
    case 504:
      return GrpcStatus.UNAVAILABLE;
    default:
      return GrpcStatus.UNKNOWN;
  }
}

function post(
  url: string,
  body: Uint8Array,
  headers: Record<string, string>,
  opts: CallOptions,
): Promise<{bytes: Uint8Array; headers: Record<string, string>}> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.responseType = 'arraybuffer';
    if (opts.timeoutMs) {
      xhr.timeout = opts.timeoutMs;
    }
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    const onAbort = () => xhr.abort();
    opts.signal?.addEventListener('abort', onAbort);
    const done = () => opts.signal?.removeEventListener('abort', onAbort);

    xhr.onload = () => {
      done();
      const respHeaders = parseResponseHeaders(xhr.getAllResponseHeaders());
      if (xhr.status !== 200) {
        const st = statusFrom({}, respHeaders);
        reject(
          new GrpcError(
            st?.code ?? httpStatusToGrpc(xhr.status),
            st?.message || `HTTP ${xhr.status}`,
          ),
        );
        return;
      }
      const buf = xhr.response as ArrayBuffer | null;
      resolve({
        bytes: buf ? new Uint8Array(buf) : new Uint8Array(0),
        headers: respHeaders,
      });
    };
    xhr.onerror = () => {
      done();
      reject(new GrpcError(GrpcStatus.UNAVAILABLE, 'Server non raggiungibile'));
    };
    xhr.ontimeout = () => {
      done();
      reject(new GrpcError(GrpcStatus.DEADLINE_EXCEEDED, 'Timeout'));
    };
    xhr.onabort = () => {
      done();
      reject(new GrpcError(GrpcStatus.CANCELLED, 'Annullato'));
    };
    // RN's XHR accepts an ArrayBuffer body; pass an exact-size copy so a
    // subarray view never leaks surrounding bytes.
    xhr.send(body.slice().buffer);
  });
}

export class GrpcWebClient {
  constructor(
    private origin: string,
    private metadata: MetadataProvider = () => ({}),
  ) {}

  setOrigin(origin: string) {
    this.origin = origin.replace(/\/+$/, '');
  }

  getOrigin() {
    return this.origin;
  }

  private async call<Req, Res>(
    path: string,
    reqCodec: MessageCodec<Req>,
    resCodec: MessageCodec<Res>,
    request: Partial<Req>,
    opts: CallOptions,
  ): Promise<Res[]> {
    if (!this.origin) {
      throw new GrpcError(GrpcStatus.FAILED_PRECONDITION, 'Nessun server');
    }
    const payload = reqCodec.encode(reqCodec.fromPartial(request)).finish();
    const headers: Record<string, string> = {
      ...this.metadata(),
      'content-type': 'application/grpc-web+proto',
      'x-grpc-web': '1',
      'x-user-agent': 'pileus-vega/1',
    };
    if (opts.timeoutMs) {
      headers['grpc-timeout'] = `${Math.ceil(opts.timeoutMs)}m`;
    }
    const resp = await post(
      `${this.origin}/grpc${path}`,
      frame(payload),
      headers,
      opts,
    );
    const {messages, trailers} = decodeFrames(resp.bytes);
    const status = statusFrom(trailers, resp.headers);
    if (status && status.code !== GrpcStatus.OK) {
      throw new GrpcError(status.code, status.message);
    }
    if (!status) {
      throw new GrpcError(
        GrpcStatus.INTERNAL,
        'gRPC-Web: risposta senza grpc-status',
      );
    }
    return messages.map(m => resCodec.decode(m));
  }

  async unary<Req, Res>(
    path: string,
    reqCodec: MessageCodec<Req>,
    resCodec: MessageCodec<Res>,
    request: Partial<Req>,
    opts: CallOptions = {},
  ): Promise<Res> {
    const out = await this.call(path, reqCodec, resCodec, request, {
      timeoutMs: 20000,
      ...opts,
    });
    if (out.length !== 1) {
      throw new GrpcError(
        GrpcStatus.INTERNAL,
        `gRPC-Web: attesi 1 messaggio, ricevuti ${out.length}`,
      );
    }
    return out[0];
  }

  /** Server-streaming call, collected once the stream closes. */
  serverStream<Req, Res>(
    path: string,
    reqCodec: MessageCodec<Req>,
    resCodec: MessageCodec<Res>,
    request: Partial<Req>,
    opts: CallOptions = {},
  ): Promise<Res[]> {
    return this.call(path, reqCodec, resCodec, request, opts);
  }
}
