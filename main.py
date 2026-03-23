import os
import json
import requests
from groq import Groq
from datetime import datetime, timedelta
import random
import time

# 1. Configuration from Environment Variables
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 SaaS Sentinel: Initiating Elite Market Intelligence Scan...")
    
    now = datetime.now()
    start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')

    # 2. Fetch High-Value SaaS News
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
        print(f"❌ NewsAPI Connection Error: {e}")
        return

    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 3. Process Articles
    for latest in articles[:3]:
        title = latest['title']
        
        # Duplicate Check
        check = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}", headers=headers)
        if check.status_code == 200 and check.json():
            print(f"⏭️ Skipping (Duplicate): {title[:30]}")
            continue

        print(f"🧠 Analyzing: {title}")
        
        # --- AI GENERATION WITH RETRY LOOP ---
        ai_data = None
        for attempt in range(3): # Try up to 3 times if JSON fails
            try:
                client = Groq(api_key=GROQ_API_KEY)
                completion = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[
                        {
                            "role": "system", 
                            "content": "You are a JSON-only strategic analyst. Never provide conversational filler. Always ensure JSON keys are 'feed_summary', 'strategic_analysis', 'impact', and 'confidence'."
                        },
                        {
                            "role": "user", 
                            "content": (
                                f"Analyze this SaaS news: {title}. Context: {latest['description']}. "
                                "1. feed_summary: 10-word max Executive Hook. "
                                "2. strategic_analysis: 3 substantial paragraphs on Market Displacement, Technical Strategy, and Moats. "
                                "CRITICAL: Do NOT repeat the summary in the analysis. "
                                "JSON Structure: {\"feed_summary\": \"...\", \"strategic_analysis\": \"...\", \"impact\": \"High\", \"confidence\": 98}"
                            )
                        }
                    ],
                    response_format={"type": "json_object"}
                )
                
                ai_data = json.loads(completion.choices[0].message.content)
                break # Success! Exit the retry loop.
            
            except Exception as e:
                print(f"⚠️ Attempt {attempt+1} failed: {e}")
                time.sleep(1) # Wait a second before retrying
        
        if not ai_data:
            print(f"❌ Permanent AI Failure for: {title}")
            continue

        # 4. Payload Mapping
        analysis_text = ai_data.get('strategic_analysis', "Strategic briefing pending evaluation.")
        
        payload = {
            "title": title,
            "summary": ai_data.get('feed_summary'),
            "analysis_content": analysis_text, 
            "confidence_score": ai_data.get('confidence', 95),
            "strategic_impact": ai_data.get('impact', 'High'),
            "image_url": latest.get('urlToImage'),
            "source_url": latest.get('url'),
            "category": "Analysis"
        }
        
        res = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers, json=payload)
        
        if res.status_code in [200, 201]:
            print(f"✅ Intelligence Synced: {title[:30]}...")
        else:
            print(f"⚠️ Supabase Error {res.status_code}: {res.text}")

if __name__ == "__main__":
    run_news_bot()
