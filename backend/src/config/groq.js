const { OpenAI } = require("openai");

// Initialize OpenAI client pointing to Groq's API gateway
const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  console.warn("[Groq AI] ⚠️ GROQ_API_KEY is not defined in the environment variables. AI features will fail.");
}

const groq = new OpenAI({
  apiKey: apiKey || "placeholder-key",
  baseURL: "https://api.groq.com/openai/v1",
});

module.exports = groq;
