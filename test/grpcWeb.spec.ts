import {BinaryWriter} from '@bufbuild/protobuf/wire';
import {ListProfilesResponse} from '../src/gen/auth';
import {decodeFrames, GrpcError, GrpcStatus, GrpcWebClient} from '../src/core/grpcWeb';
import * as auth from '../src/gen/auth';

function frame(flag: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  out[0] = flag;
  new DataView(out.buffer).setUint32(1, payload.length, false);
  out.set(payload, 5);
  return out;
}
const ascii = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

describe('decodeFrames', () => {
  it('splits data frames from the trailer frame', () => {
    const body = concat(
      frame(0, Uint8Array.of(1, 2)),
      frame(0, Uint8Array.of(3)),
      frame(0x80, ascii('grpc-status: 0\r\ngrpc-message: ok\r\n')),
    );
    const {messages, trailers} = decodeFrames(body);
    expect(messages.map(m => Array.from(m))).toEqual([[1, 2], [3]]);
    expect(trailers).toEqual({'grpc-status': '0', 'grpc-message': 'ok'});
  });

  it('rejects a truncated frame', () => {
    const f = frame(0, Uint8Array.of(1, 2, 3)).subarray(0, 6);
    expect(() => decodeFrames(f)).toThrow(GrpcError);
  });
});

// Minimal XHR double: records the request, answers with a canned response.
class FakeXHR {
  static next: {status: number; body: Uint8Array; headers?: string};
  static last: FakeXHR;
  method = '';
  url = '';
  sent?: ArrayBuffer;
  reqHeaders: Record<string, string> = {};
  responseType = '';
  timeout = 0;
  status = 0;
  response: ArrayBuffer | null = null;
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  open(m: string, u: string) {
    this.method = m;
    this.url = u;
  }
  setRequestHeader(k: string, v: string) {
    this.reqHeaders[k] = v;
  }
  getAllResponseHeaders() {
    return FakeXHR.next.headers ?? '';
  }
  abort() {
    this.onabort?.();
  }
  send(b: ArrayBuffer) {
    FakeXHR.last = this;
    this.sent = b;
    this.status = FakeXHR.next.status;
    const body = FakeXHR.next.body;
    this.response = body.slice().buffer;
    setTimeout(() => this.onload?.(), 0);
  }
}

describe('GrpcWebClient', () => {
  beforeEach(() => {
    (globalThis as any).XMLHttpRequest = FakeXHR;
  });

  it('posts a framed request and decodes the response', async () => {
    const payload = ListProfilesResponse.encode(
      ListProfilesResponse.fromPartial({profiles: [{profileId: 'p1', name: 'Anna'}]}),
    ).finish();
    FakeXHR.next = {
      status: 200,
      body: concat(frame(0, payload), frame(0x80, ascii('grpc-status: 0\r\n'))),
    };
    const c = new GrpcWebClient('http://10.0.0.2:8000/', () => ({authorization: 'Bearer x'}));
    c.setOrigin('http://10.0.0.2:8000/');
    const r = await c.unary(
      '/mycelium.AuthService/ListProfiles',
      auth.ListProfilesRequest,
      auth.ListProfilesResponse,
      {},
    );
    expect(r.profiles[0]).toMatchObject({profileId: 'p1', name: 'Anna'});
    expect(FakeXHR.last.url).toBe('http://10.0.0.2:8000/grpc/mycelium.AuthService/ListProfiles');
    expect(FakeXHR.last.reqHeaders['content-type']).toBe('application/grpc-web+proto');
    expect(FakeXHR.last.reqHeaders.authorization).toBe('Bearer x');
    // Empty request → just the 5-byte frame header.
    expect(Array.from(new Uint8Array(FakeXHR.last.sent!))).toEqual([0, 0, 0, 0, 0]);
  });

  it('maps a trailers-only error from the HTTP headers', async () => {
    FakeXHR.next = {
      status: 200,
      body: new Uint8Array(0),
      headers: 'grpc-status: 16\r\ngrpc-message: token%20scaduto\r\n',
    };
    const c = new GrpcWebClient('http://h:8000');
    await expect(
      c.unary('/x/Y', auth.RefreshTokenRequest, auth.AuthorizeDeviceResponse, {}),
    ).rejects.toMatchObject({code: GrpcStatus.UNAUTHENTICATED, message: 'token scaduto'});
  });

  it('round-trips int64 as number and utf-8 strings', () => {
    const w = auth.AuthorizeDeviceResponse.encode({deviceJwt: 'è€', expiresAt: 1760000000000});
    expect(w).toBeInstanceOf(BinaryWriter);
    const back = auth.AuthorizeDeviceResponse.decode(w.finish());
    expect(back).toEqual({deviceJwt: 'è€', expiresAt: 1760000000000});
  });
});
