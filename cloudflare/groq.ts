export type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type GroqConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

export class GroqServiceError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status = 502, retryable = false) {
    super(message);
    this.name = 'GroqServiceError';
    this.status = status;
    this.retryable = retryable;
  }
}

export async function generateGroqResponse(config: GroqConfig, messages: GroqChatMessage[], userId: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
        max_completion_tokens: 500,
        user: userId,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new GroqServiceError(
        response.status === 429 ? 'Groq is temporarily rate-limited.' : 'Groq could not generate a response.',
        response.status,
        response.status === 408 || response.status === 429 || response.status >= 500,
      );
    }
    const payload = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new GroqServiceError('Groq returned an invalid response.', 502, false);
    return content.trim().slice(0, 4096);
  } catch (error) {
    if (error instanceof GroqServiceError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new GroqServiceError('Groq response timed out.', 504, true);
    throw new GroqServiceError('Groq could not be reached.', 502, true);
  } finally {
    clearTimeout(timer);
  }
}
