
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

// Use dynamic imports inside functions to avoid top-level resolution issues on Vercel
const getAI = async () => {
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const key = getApiKey();
    if (!key) return null;
    return new GoogleGenerativeAI(key);
  } catch (e) {
    console.error("Failed to load @google/generative-ai", e);
    return null;
  }
};

export async function fetchTopSaaSNews(topArticlesContext?: string) {
  try {
    const ai = await getAI();
    if (!ai) throw new Error("Gemini API key missing or SDK failed to load");
    
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
  try {
    const ai = await getAI();
    if (!ai) throw new Error("Gemini API key missing or SDK failed to load");
    
    const model = ai.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const prompt = `Act as an Elite Senior SaaS Market Analyst. Analyze: ${headline}. Snippet: ${snippet}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to generate article", e);
    return { title: headline, content: snippet || "" };
  }
}

export async function parseNewsIntoStories(rawNews: string) {
  try {
    const ai = await getAI();
    if (!ai) throw new Error("Gemini API key missing or SDK failed to load");
    
    const model = ai.getGenerativeModel({ 
      model: "gemini-1.5-flash", 
      generationConfig: { responseMimeType: "application/json" } 
    });
    const prompt = `Extract news stories from: ${rawNews}`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (e) {
    console.error("Failed to parse news", e);
    return [];
  }
}
