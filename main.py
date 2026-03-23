import os
import json
import requests
from groq import Groq
from datetime import datetime, timedelta
import random
import time

# 1. Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 SaaS Sentinel: Initiating Elite Market Intelligence Scan...")
    
    if not GROQ_API_KEY:
        print("❌ Error: GROQ_API_KEY is not set.")
        return
    client = Groq(api_key=GROQ_API_KEY)

    now = datetime.now()
    start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')

    # 2. Fetch News
    search_query = 'B2B SaaS OR "Enterprise AI" OR "SaaS Architecture" OR "Cloud Infrastructure"'
    params = {
        "q": search_query, 
        "from": start_date, 
        "language": "en", 
        "sortBy": "relevancy", 
        "apiKey": NEWS_API_KEY
    }
    
    try:
        response = requests.get("https://newsapi.org/v2/everything", params=params)
        response.raise_for_status()
        articles = response.json().get('articles', [])
        print(f"📡 Found {len(articles)} potential intelligence sources.")
    except Exception as e:
        print(f"❌ NewsAPI Error: {e}")
        return

    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    processed_count = 0
    for latest in articles[:10]:
        if processed_count >= 3:
            break

        title = latest['title']
        if not title or "[Removed]" in title:
            continue
            
        try:
            check = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{requests.utils.quote(title)}", headers=headers)
            if check.status_code == 200 and check.json():
                print(f"⏭️ Skipping (Already Analyzed): {title[:40]}...")
                continue
        except Exception as e:
            print(f"⚠️ Duplicate check failed for: {title[:20]}")

        print(f"\n🧠 Deep Analyzing: {title}")
        
        ai_data = None
        for attempt in range(3):
            try:
                completion = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    temperature=0.8,
                    messages=[
                        {
                            "role": "system", 
                            "content": (
                                "You are a Senior SaaS Strategy Consultant and Market Analyst. "
                                "Your goal is to provide deep, contrarian, and technical insights that go beyond the surface-level news. "
                                "Focus on architectural shifts, competitive moats, and long-term market implications."
                            )
                        },
                        {
                            "role": "user", 
                            "content": (
                                f"News Item: {title}\n"
                                f"Description: {latest.get('description', 'No description available.')}\n\n"
                                "TASK:\n"
                                "1. feed_summary: A punchy, 10-word 'Executive Hook' that captures the core strategic shift.\n"
                                "2. strategic_analysis: 3 Detailed Paragraphs of UNIQUE INSIGHT (separated by \\n\\n).\n"
                                "   - Paragraph 1: THE ARCHITECTURAL IMPACT. Discuss the technical stack, scalability, or AI integration nuances.\n"
                                "   - Paragraph 2: THE COMPETITIVE CHESSBOARD. Identify specific rivals and explain how this move disrupts their positioning.\n"
                                "   - Paragraph 3: THE 12-MONTH PROJECTION. Provide a bold, data-backed prediction for this company's trajectory.\n"
                                "3. impact: Choose one: 'High', 'Medium', or 'Low'.\n"
                                "4. sentiment: Choose one: 'BULLISH', 'BEARISH', or 'NEUTRAL'.\n\n"
                                "CRITICAL RULES:\n"
                                "- DO NOT repeat the news description.\n"
                                "- DO NOT repeat the 'feed_summary' inside the 'strategic_analysis'.\n"
                                "- The 'feed_summary' is for the high-level hook; the 'strategic_analysis' is for deep technical/market details.\n"
                                "- If you repeat information between these two fields, the report is invalid.\n\n"
                                "JSON Structure:\n"
                                "{\n"
                                "  \"feed_summary\": \"...\",\n"
                                "  \"strategic_analysis\": \"...\",\n"
                                "  \"impact\": \"...\",\n"
                                "  \"sentiment\": \"...\"\n"
                                "}"
                            )
                        }
                    ],
                    response_format={"type": "json_object"}
                )
                
                ai_data = json.loads(completion.choices[0].message.content)
                break 
            except Exception as e:
                print(f"⚠️ AI Attempt {attempt+1} failed: {e}")
                time.sleep(2)
        
        if not ai_data:
            continue

        raw_analysis = ai_data.get('strategic_analysis', "")
        if isinstance(raw_analysis, dict):
            clean_analysis = "\n\n".join([str(v) for v in raw_analysis.values()])
        else:
            clean_analysis = str(raw_analysis)

        payload = {
            "title": title,
            "summary": str(ai_data.get('feed_summary', "")),
            "analysis_content": clean_analysis.strip(), 
            "confidence_score": random.randint(95, 99),
            "strategic_impact": ai_data.get('impact', 'High'),
            "category": ai_data.get('sentiment', 'BULLISH'),
            "image_url": latest.get('urlToImage') or "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1000",
            "source_url": latest.get('url'),
            "published_at": latest.get('publishedAt') or datetime.now().isoformat()
        }
        
        try:
            save_response = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
            save_response.raise_for_status()
            print(f"✅ Intelligence Logged: {title[:50]}...")
            processed_count += 1
        except Exception as e:
            print(f"❌ Supabase Save Error: {e}")

    print(f"\n✨ Scan Complete. {processed_count} new intelligence reports generated.")

if __name__ == "__main__":
    run_news_bot()
