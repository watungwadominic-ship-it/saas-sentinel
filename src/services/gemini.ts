import { GoogleGenAI, Type } from "@google/genai";

const getApiKey = () => {
  // Check Vite environment variables first (browser)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_USER_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_USER_GEMINI_API_KEY;
  }
  // Check Node environment variables (server)
  if (typeof process !== 'undefined' && process.env) {
    return process.env.VITE_USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  }
  return '';
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export async function fetchTopSaaSNews(topArticlesContext?: string) {
  try {
    const model = "gemini-3-flash-preview";
    const query = "(SaaS OR 'Enterprise AI' OR 'Cloud Computing' OR 'B2B Tech') AND (Launch OR Funding OR Update OR Acquisition)";
    
    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
    const timeframe = isWeekend ? "72 hours" : "24 hours";

    if (isWeekend) {
      console.log(`Weekend Mode Active: Fetching news from the last 72 hours...`);
    }
    
    console.log(`Searching for SaaS intelligence... ${query}`);

    const prompt = `Search for the top 5 most significant, high-quality news stories using this exact query: "${query}". 
    Focus on the last ${timeframe}. 
    
    FALLBACK: If no relevant news is found for the last ${timeframe}, expand your search to the last 72 hours. 
    
    PREVENTION: If the search returns zero results for the last 72 hours, do not say "No relevant news found". 
    Instead, re-analyze the following top articles from the last week and generate a "Weekly Sentiment" post summarizing the overall market mood and key shifts.
    
    Top Articles Context:
    ${topArticlesContext || "No previous articles provided. Summarize the single most important trending SaaS topic from the current week instead."}
    
    For each story (or the sentiment post), provide a headline and a brief summary of the raw facts.`;

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
  const model = "gemini-3.1-pro-preview";
  const prompt = `Act as an Elite Senior SaaS Market Analyst. Analyze this news: ${headline}.
If this news involves funding or acquisitions, set category to 'Market Analysis'.
If it is a product launch, set category to 'Intelligence Feed'.
Otherwise, use 'Intelligence Feed'.

Now, write a structured analysis for 'SaaS Sentinel'.
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
          verdict: { type: Type.STRING, description: "1-sentence bold prediction (The Verdict)." }
        },
        required: ["title", "content", "category", "breakdown", "sentinel_take", "verdict"]
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
