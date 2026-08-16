// Thin wrapper around the Gemini REST API. Ported from interview-os's src/lib/gemini.js.

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";

export async function callGemini(prompt: string, systemInstruction = ""): Promise<string> {
  const response = await fetch(`${BASE_URL}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
    }),
  });
  const data = await response.json();
  if (data.error) {
    console.error("Gemini API error:", data.error);
    throw new Error(data.error.message ?? "Gemini API error");
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error("Gemini unexpected response:", JSON.stringify(data));
    throw new Error("No response from Gemini.");
  }
  return text;
}
