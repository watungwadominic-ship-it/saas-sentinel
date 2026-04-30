import { GoogleGenerativeAI } from "@google/generative-ai";

const getApiKey = () => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.VITE_USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  }
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_USER_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_USER_GEMINI_API_KEY;
  }
  return '';
};

let aiInstance: GoogleGenerativeAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    const key = getApiKey();
    if (!key) return null;
    aiInstance = new GoogleGenerativeAI(key);
  }
  return aiInstance;
};

export async function fetchTopSaaSNews(topArticlesContext?: string) {
  try {
    const ai = getAI();
    if (!ai) throw new Error("Gemini API key missing");
    
    const modelName = "gemini-1.5-flash";
    const query = "(SaaS OR 'Enterprise AI' OR 'Cloud Computing') AND (Launch OR Funding OR Update)";
    const prompt = `Search for the top 3 most significant SaaS news stories from the last 24 hours using this query: "${query}".`;

    const model = ai.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Error fetching news from Gemini:", error);
    return "No relevant news found.";
  }
}

export async function generateArticle(headline: string, snippet: string) {
  const ai = getAI();
  if (!ai) throw new Error("Gemini API key missing");
  
  const model = ai.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });
  
  const prompt = `Act as an Elite Senior SaaS Market Analyst. Analyze: ${headline}. Snippet: ${snippet}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    return JSON.parse(text);
  } catch (e) {
    return { title: headline, content: text };
  }
}

export async function parseNewsIntoStories(rawNews: string) {
  const ai = getAI();
  if (!ai) throw new Error("Gemini API key missing");
  
  const model = ai.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" } });
  const prompt = `Extract news stories from: ${rawNews}`;

  const result = await model.generateContent(prompt);
  try {
    return JSON.parse(result.response.text());
  } catch (e) {
    return [];
  }
}
