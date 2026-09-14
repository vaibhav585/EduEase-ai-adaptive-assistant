/**
 * Backend client. Phase 0.3: these used to point at /api/simplify and /api/translate,
 * which were never mounted — every call 404'd. Repointed at the real endpoints.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${path} failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export function simplifyText(text: string, profile = 'default') {
  return post<{ simplified_text: string }>('/api/simplify-text/', { text, profile });
}

export function generateQuiz(text: string) {
  return post<{ questions: unknown[] }>('/api/generate-quiz/', { text });
}

export function getChatbotResponse(message: string, userId: string) {
  return post<{ response: string; reply: string }>('/api/chatbot/', {
    text: message,
    user_id: userId,
  });
}
