import { GoogleGenAI } from '@google/genai'

// Reads GEMINI_API_KEY from the environment.
export function getGemini() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}
