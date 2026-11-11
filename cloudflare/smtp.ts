import { connect, type Socket } from 'cloudflare:sockets';

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  ehloName: string;
};

export type SmtpMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64(value: string) {
  const bytes = encoder.encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]/g, ' ').trim();
}

function headerValue(value: string) {
  const clean = cleanHeader(value);
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${base64(clean)}?=`;
}

function mailbox(value: string) {
  const clean = cleanHeader(value);
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(clean)) throw new Error('Invalid email address');
  return clean;
}

function address(value: string, name?: string) {
  const email = mailbox(value);
  return name ? `${headerValue(name)} <${email}>` : `<${email}>`;
}

function normalizeBody(value: string) {
  return value.replace(/\r?\n/g, '\r\n');
}

function dotStuff(value: string) {
  return value.replace(/(^|\r\n)\./g, '$1..');
}

function buildMimeMessage(config: SmtpConfig, message: SmtpMessage) {
  const recipients = (Array.isArray(message.to) ? message.to : [message.to]).map(mailbox);
  if (!recipients.length) throw new Error('At least one recipient is required');
  const boundary = `=_SamEduHub_${crypto.randomUUID().replaceAll('-', '')}`;
  const headers = [
    `From: ${address(config.fromEmail, config.fromName)}`,
    `To: ${recipients.map(email => address(email)).join(', ')}`,
    ...(message.replyTo ? [`Reply-To: ${address(message.replyTo)}`] : []),
    `Subject: ${headerValue(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@sameduhub.com>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const plainPart = `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${normalizeBody(message.text)}`;
  const htmlPart = `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${normalizeBody(message.html)}`;
  return `${headers.join('\r\n')}\r\n\r\n${plainPart}\r\n${htmlPart}\r\n--${boundary}--`;
}

class SmtpSession {
  private socket: Socket;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = '';

  constructor(socket: Socket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  async write(value: string) {
    await this.writer.write(encoder.encode(value));
  }

  private async readLine() {
    while (true) {
      const lineEnd = this.buffer.indexOf('\r\n');
      if (lineEnd >= 0) {
        const line = this.buffer.slice(0, lineEnd);
        this.buffer = this.buffer.slice(lineEnd + 2);
        return line;
      }
      const result = await this.reader.read();
      if (result.done) throw new Error('SMTP connection closed unexpectedly');
      this.buffer += decoder.decode(result.value, { stream: true });
      if (this.buffer.length > 64 * 1024) throw new Error('SMTP response was too large');
    }
  }

  async response() {
    let responseCode = 0;
    while (true) {
      const line = await this.readLine();
      const match = /^(\d{3})([ -])/.exec(line);
      if (!match) throw new Error('Invalid SMTP response');
      responseCode = Number(match[1]);
      if (match[2] === ' ') return responseCode;
    }
  }

  async command(command: string, expected: number[]) {
    await this.write(`${command}\r\n`);
    const code = await this.response();
    if (!expected.includes(code)) throw new Error(`SMTP command failed with status ${code}`);
  }

  async upgradeToTls() {
    this.reader.releaseLock();
    this.writer.releaseLock();
    this.socket = this.socket.startTls();
    await this.socket.opened;
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
    this.buffer = '';
  }

  async close() {
    try { this.reader.releaseLock(); } catch { /* already released */ }
    try { this.writer.releaseLock(); } catch { /* already released */ }
    try { await this.socket.close(); } catch { /* connection already closed */ }
  }
}

export async function sendSmtpEmail(config: SmtpConfig, message: SmtpMessage) {
  const socket = connect({ hostname: config.host, port: config.port }, { secureTransport: 'starttls', allowHalfOpen: false });
  await socket.opened;
  const session = new SmtpSession(socket);
  let stage = 'greeting';
  try {
    const greeting = await session.response();
    if (greeting !== 220) throw new Error(`SMTP greeting failed with status ${greeting}`);
    stage = 'initial EHLO';
    await session.command(`EHLO ${cleanHeader(config.ehloName)}`, [250]);
    stage = 'STARTTLS';
    await session.command('STARTTLS', [220]);
    stage = 'TLS handshake';
    await session.upgradeToTls();
    stage = 'secure EHLO';
    await session.command(`EHLO ${cleanHeader(config.ehloName)}`, [250]);
    stage = 'SMTP authentication';
    await session.command('AUTH LOGIN', [334]);
    await session.command(base64(config.username), [334]);
    await session.command(base64(config.password), [235]);
    stage = 'sender validation';
    await session.command(`MAIL FROM:<${mailbox(config.fromEmail)}>`, [250]);
    stage = 'recipient validation';
    const recipients = (Array.isArray(message.to) ? message.to : [message.to]).map(mailbox);
    for (const recipient of recipients) await session.command(`RCPT TO:<${recipient}>`, [250, 251]);
    stage = 'message delivery';
    await session.command('DATA', [354]);
    await session.write(`${dotStuff(buildMimeMessage(config, message))}\r\n.\r\n`);
    const delivered = await session.response();
    if (delivered !== 250) throw new Error(`SMTP delivery failed with status ${delivered}`);
    stage = 'connection close';
    await session.command('QUIT', [221]);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'unknown SMTP error';
    throw new Error(`${stage}: ${messageText}`);
  } finally {
    await session.close();
  }
}
