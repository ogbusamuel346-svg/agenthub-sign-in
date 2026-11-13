export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
  timeoutMs: number;
};

export class WhatsAppServiceError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status = 502, retryable = false) {
    super(message);
    this.name = 'WhatsAppServiceError';
    this.status = status;
    this.retryable = retryable;
  }
}

export async function sendWhatsAppText(config: WhatsAppConfig, to: string, body: string) {
  if (!/^\+?[1-9]\d{6,14}$/.test(to)) throw new WhatsAppServiceError('The WhatsApp recipient number is invalid.', 400, false);
  if (!body.trim() || body.length > 4096) throw new WhatsAppServiceError('The WhatsApp message is empty or too long.', 400, false);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(config.graphApiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new WhatsAppServiceError(
        response.status === 429 ? 'WhatsApp is temporarily rate-limited.' : 'WhatsApp could not send the message.',
        response.status,
        response.status === 408 || response.status === 429 || response.status >= 500,
      );
    }
    const payload = await response.json().catch(() => null) as { messages?: Array<{ id?: unknown }> } | null;
    const messageId = payload?.messages?.[0]?.id;
    if (typeof messageId !== 'string' || !messageId) throw new WhatsAppServiceError('WhatsApp returned an invalid message response.', 502, false);
    return messageId;
  } catch (error) {
    if (error instanceof WhatsAppServiceError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new WhatsAppServiceError('WhatsApp response timed out.', 504, true);
    throw new WhatsAppServiceError('WhatsApp could not be reached.', 502, true);
  } finally {
    clearTimeout(timer);
  }
}
