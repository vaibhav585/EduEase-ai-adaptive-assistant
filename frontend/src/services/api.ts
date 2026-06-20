const API_URL = `${import.meta.env.VITE_API_URL}/api`;

export async function simplifyText(text: string) {
  const response = await fetch(`${API_URL}/simplify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return response.json();
}

export async function translateText(text: string, target_lang: string) {
  const response = await fetch(`${API_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target_lang }),
  });
  return response.json();
}

export async function getChatbotResponse(message: string, user_id: string) {
  const response = await fetch(`${API_URL}/chatbot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, user_id }),
  });
  return response.json();
}
