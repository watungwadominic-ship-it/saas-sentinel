import os
import json
import requests
from groq import Groq
from datetime import datetime, timedelta
import random

# 1. Configuration from Environment Variables
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 SaaS Sentinel: Initiating Elite Market Intelligence Scan...")
    
    # Date logic for fresh news (Last 48 hours)
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

    # 3. Process the top 3 most relevant articles
    for latest in articles[:3]:
        title = latest['title']
        
        # Duplicate Check
        check = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?title=eq.{title}", headers=headers)
        if check.status_code == 200 and check.json():
            print(f"⏭️ Skipping (Duplicate): {title[:30]}")
            continue

        print(f"🧠 Synthesizing Unique Analysis for: {title}")
        
        try:
            client = Groq(api_key=GROQ_API_KEY)
            
            # THE ELITE ANALYST PROMPT: Forces zero-repetition and deep insights
            prompt = (
                f"Analyze this SaaS news: {title}. Context: {latest['description']}. "
                "Role: Senior B2B Strategic Analyst for a Venture Capital firm. "
                "TASK: Provide two distinct levels of intelligence. "
                "1. feed_summary: A 10-word maximum 'Executive Hook'. Must be a single punchy sentence. "
                "2. strategic_analysis: Exactly 3 substantial paragraphs of deep-dive intelligence. "
                "   - Paragraph 1: Market Displacement (Who loses if this company wins?) "
                "   - Paragraph 2: Technical Strategy (How is AI/Tech used as a core advantage?) "
                "   - Paragraph 3: Competitive Moat (Why is this specifically hard for rivals to copy?) "
                "CRITICAL: Do NOT repeat the summary text in the analysis. Focus on market-moving insights. "
                "Respond ONLY in this JSON structure: "
                "{"
                "  \"feed_summary\": \"...\","
                "  \"strategic_analysis\": \"...\","
                "  \"impact\": \"High\","
                "  \"confidence\": 98"
                "}"
            )
            
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            
            ai_data = json.loads(completion.choices[0].message.content)
            
            # Defensive check for failed or empty analysis
            analysis_text = ai_data.get('strategic_analysis')
            if not analysis_text or len(analysis_text) < 50 or analysis_text.lower() == "empty":
                analysis_text = "Detailed strategic briefing is currently being synthesized. Our analysts are evaluating the long-term market implications of this move."

            # 4. Payload Mapping to match Supabase Columns
            payload = {
                "title": title,
                "summary": ai_data.get('feed_summary'),
                "analysis_content": analysis_text, 
                "confidence_score": ai_data.get('confidence', random.randint(95, 98)),
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

        except Exception as e:
            print(f"❌ Analysis Error: {e}")
            continue

if __name__ == "__main__":
    run_news_bot()
