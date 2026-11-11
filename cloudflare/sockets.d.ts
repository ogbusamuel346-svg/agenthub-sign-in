declare module 'cloudflare:sockets' {
  export interface Socket {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<{ remoteAddress: string | null; localAddress: string | null }>;
    closed: Promise<void>;
    startTls(): Socket;
    close(): Promise<void>;
  }

  export function connect(
    address: { hostname: string; port: number },
    options?: { secureTransport?: 'off' | 'on' | 'starttls'; allowHalfOpen?: boolean },
  ): Socket;
}
