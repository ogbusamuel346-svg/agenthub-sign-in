const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createMetaWebhookSignature(rawBody: string, appSecret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `sha256=${hex(await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody)))}`;
}

export async function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader || !appSecret) return false;
  const expected = await createMetaWebhookSignature(rawBody, appSecret);
  if (signatureHeader.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ signatureHeader.charCodeAt(index);
  return difference === 0;
}
