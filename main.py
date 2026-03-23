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
        
        ai_data = None
        # RETRY LOOP: Handles the 'json_validate_failed' errors seen in previous logs
        for attempt in range(3):
            try:
                client = Groq(api_key=GROQ_API_KEY)
                completion = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[
                        {
                            "role": "system", 
                            "content": "You are a JSON-only strategic analyst. Output ONLY a flat JSON object. Never include conversational filler."
                        },
                        {
                            "role": "user", 
                            "content": (
                                f"Analyze this SaaS news: {title}. Context: {latest['description']}. "
                                "Provide: 1. feed_summary (10-word max hook), 2. strategic_analysis (3 deep paragraphs). "
                                "Focus on: Market Displacement, Technical Strategy, and Competitive Moats. "
                                "Constraint: DO NOT repeat the summary in the analysis section. "
                                "JSON Structure: {\"feed_summary\": \"...\", \"strategic_analysis\": \"...\", \"impact\": \"High\", \"confidence\": 98}"
                            )
                        }
                    ],
                    # Forces the model to provide a valid JSON structure
                    response_format={"type": "json_object"}
                )
                
                ai_data = json.loads(completion.choices[0].message.content)
                break 
            except Exception as e:
                print(f"⚠️ Attempt {attempt+1} failed: {e}")
                time.sleep(1)
        
        if not ai_data:
            print(f"❌ Permanent AI Failure for: {title}")
            continue

        # --- DATA CLEANING & EXTRACTION ---
        # Fixes the bug where brackets {} were being saved in the database
        analysis_body = ai_data.get('strategic_analysis', "")
        
        # If the AI nested the response inside a dictionary, flatten it into a string
        if isinstance(analysis_body, dict):
            analysis_body = "\n\n".join([str(v) for v in analysis_body.values()])
        
        clean_summary = str(ai_data.get('feed_summary', "")).strip()
        clean_analysis = str(analysis_body).strip()

        # Fallback for empty or too-short generations
        if len(clean_analysis) < 50:
            clean_analysis = "Detailed strategic briefing is currently being synthesized. Our analysts are evaluating the long-term market implications of this move."

        # 4. Payload Mapping to Supabase
        payload = {
            "title": title,
            "summary": clean_summary,
            "analysis_content": clean_analysis, 
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
            print(f"⚠️ Supabase Error: {res.text}")

if __name__ == "__main__":
    run_news_bot()
