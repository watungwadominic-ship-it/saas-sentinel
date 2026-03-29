import { GoogleGenAI, Type } from "@google/genai";

const getApiKey = () => {
  // Check Node environment variables (server)
  if (typeof process !== 'undefined' && process.env) {
    return process.env.VITE_USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  }
  // Check Vite environment variables (browser)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_USER_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_USER_GEMINI_API_KEY;
  }
  return '';
};

let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    const key = getApiKey();
    if (!key) return null;
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
};

export async function fetchTopSaaSNews(topArticlesContext?: string) {
  try {
    const ai = getAI();
    if (!ai) throw new Error("Gemini API key missing");
    const model = "gemini-3-flash-preview";
    const query = "(SaaS OR 'Enterprise AI' OR 'Cloud Computing') AND (Launch OR Funding OR Update)";
    
    console.log(`Searching for SaaS intelligence... ${query}`);

    const prompt = `Search for the top 3 most significant SaaS news stories from the last 24 hours using this query: "${query}". 
    For each story, provide a headline and a brief summary of the raw facts.`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    return response.text;
  } catch (error) {
    console.error("Error fetching news from Gemini:", error);
    return "No relevant news found.";
  }
}

export async function generateArticle(headline: string, snippet: string) {
  const ai = getAI();
  if (!ai) throw new Error("Gemini API key missing");
  const model = "gemini-3-flash-preview"; // Faster than Pro
  const prompt = `Act as an Elite Senior SaaS Market Analyst. Analyze this news: ${headline}.
  
  If this news involves funding or acquisitions, set category to 'Market Analysis'.
  If it is a product launch, set category to 'Intelligence Feed'.
  Otherwise, use 'Intelligence Feed'.
  
  Write a structured analysis for 'SaaS Sentinel'.
  Tone: Elite, Insightful, and Sassy.
  
  Structure:
  1. The Signal (Headline): Create a punchy, professional headline.
  2. The Breakdown: Summarize the core facts into exactly 3 bullet points.
  3. The Sentinel's Take: Write 2 paragraphs explaining why this news matters for B2B SaaS founders and what their strategy should be.
  4. The Verdict: Provide a bold 1-sentence prediction for the next 6 months.
  
  Data Input: Headline: ${headline}, Snippet: ${snippet}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "The punchy headline (The Signal)." },
          content: { type: Type.STRING, description: "The full article content in Markdown." },
          category: { type: Type.STRING, enum: ["Market Analysis", "Intelligence Feed"], description: "The category of the news." },
          breakdown: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "3 bullet points summarizing the facts (The Breakdown)."
          },
          sentinel_take: { type: Type.STRING, description: "2 paragraphs of elite market analysis (The Sentinel's Take)." },
          verdict: { type: Type.STRING, description: "1-sentence bold prediction (The Verdict)." },
          image_url: { type: Type.STRING, description: "A high-quality Unsplash image ID (e.g., 1510511459019-5dee997dd1db) relevant to the specific SaaS/AI topic mentioned in the headline. Do NOT provide a full URL, just the ID part after 'photo-'." }
        },
        required: ["title", "content", "category", "breakdown", "sentinel_take", "verdict", "image_url"]
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to parse generated article", e);
    return { 
      title: headline,
      content: response.text, 
      category: "Intelligence Feed",
      breakdown: [snippet],
      sentinel_take: "Analysis pending.",
      verdict: "Market volatility expected."
    };
  }
}

export async function parseNewsIntoStories(rawNews: string) {
  const ai = getAI();
  if (!ai) throw new Error("Gemini API key missing");
  const model = "gemini-3-flash-preview";
  const prompt = `Extract news stories from the following text. Return them as a JSON array of objects with 'title', 'snippet', and 'category' fields.
  If the text is a single summary of a trending topic or structural shift, return it as a single object in the array.
  
  Text: ${rawNews}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to parse news stories", e);
    return [];
  }
}
