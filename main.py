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
    
    now = datetime.now()
    start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')

    # 2. Fetch News
    search_query = 'B2B SaaS OR "Enterprise AI" OR "SaaS Architecture"'
    params = {
        "q": search_query, 
        "from": start_date, 
        "language": "en", 
        "sortBy": "relevancy", 
        "apiKey": NEWS_API_KEY
    }
    
    try:
        response = requests.get("https://newsapi.org/v2/everything", params=params)
        articles = response.json().get('articles', [])
    except Exception as e:
        print(f"❌ NewsAPI Error: {e}")
        return

    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    for latest in articles[:3]:
        title = latest['title']
        
        # Duplicate Check
        check = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}", headers=headers)
        if check.status_code == 200 and check.json():
            print(f"⏭️ Skipping: {title[:30]}")
            continue

        print(f"🧠 Deep Analyzing: {title}")
        
        ai_data = None
        for attempt in range(3):
            try:
                client = Groq(api_key=GROQ_API_KEY)
                completion = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    temperature=0.75, # Boosted for original strategic thinking
                    messages=[
                        {
                            "role": "system", 
                            "content": "You are a Senior SaaS Strategy Consultant. Your job is to provide market predictions and technical critiques that ARE NOT in the provided news text."
                        },
                        {
                            "role": "user", 
                            "content": (
                                f"News Item: {title}\nDescription: {latest['description']}\n\n"
                                "TASK:\n"
                                "1. feed_summary: A 10-word 'Headline Hook'.\n"
                                "2. strategic_analysis: 3 Long Paragraphs of UNIQUE INSIGHT.\n"
                                "   - Para 1: The TECHNICAL SHIFT (Explain the architecture or AI tech stack involved).\n"
                                "   - Para 2: COMPETITIVE THREAT (Name 2 specific rivals and how this hurts them).\n"
                                "   - Para 3: 12-MONTH PROJECTION (A bold prediction for this company).\n\n"
                                "CRITICAL: The analysis MUST NOT use the same sentences as the summary. If you repeat the description, the report fails.\n\n"
                                "JSON Structure: {\"feed_summary\": \"...\", \"strategic_analysis\": \"...\", \"impact\": \"High\", \"sentiment\": \"BULLISH\"}"
                            )
                        }
                    ],
                    response_format={"type": "json_object"}
                )
                
                ai_data = json.loads(completion.choices[0].message.content)
                break 
            except Exception as e:
                time.sleep(1)
        
        if not ai_data:
            continue

        # Force-Flattening to prevent brackets in DB
        raw_analysis = ai_data.get('strategic_analysis', "")
        if isinstance(raw_analysis, dict):
            clean_analysis = "\n\n".join([str(v) for v in raw_analysis.values()])
        else:
            clean_analysis = str(raw_analysis)

        # 4. Save to Supabase (Mapping Sentiment to Category for the UI)
        payload = {
            "title": title,
            "summary": str(ai_data.get('feed_summary', "")),
            "analysis_content": clean_analysis.strip(), 
            "confidence_score": random.randint(95, 99),
            "strategic_impact": ai_data.get('impact', 'High'),
            "category": ai_data.get('sentiment', 'BULLISH'), 
            "image_url": latest.get('urlToImage'),
            "source_url": latest.get('url')
        }
        
        requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)

if __name__ == "__main__":
    run_news_bot()
