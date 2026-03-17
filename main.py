import os
import requests
from groq import Groq
from datetime import datetime, timedelta

# 1. SETUP KEYS
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

def run_news_bot():
    print("🚀 Running SaaS Sentinel Executive Analyst...")
    
    # 2. FETCH RAW NEWS
    week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    news_params = {
        "q": "SaaS B2B startup funding",
        "from": week_ago,
        "sortBy": "relevancy",
        "apiKey": NEWS_API_KEY
    }
    headers_news = {"User-Agent": "SaaSSentinelBot/1.0"}
    
    try:
        response_news = requests.get("https://newsapi.org/v2/everything", params=news_params, headers=headers_news)
        response_news.raise_for_status() 
        raw_data = response_news.json()
    except Exception as e:
        print(f"❌ FETCH FAILED: {e}")
        return

    articles = raw_data.get('articles', [])
    if not articles:
        print("⚠️ No news found.")
        return

    latest_story = articles[0]
    
    # 3. PROFESSIONAL ANALYSIS PROMPT
    try:
        client = Groq(api_key=GROQ_API_KEY)
        # 2026 Executive Prompt: Focusing on Outcomes and Strategy
        prompt = f"""
        ACT AS: Senior B2B SaaS Analyst (March 2026).
        ANALYSIS GOAL: Write for a busy CEO/Founder who needs 'Decision-Grade' insights.
        STORY: {latest_story['title']}
        CONTEXT: {latest_story['description']}
        
        STRUCTURE:
        1. [TL;DR Summary]: 2 sentences max.
        2. [The News]: Direct facts only.
        3. [Strategic 'So What?']: Why this matters for the 2026 SaaS market.
        4. [Competitive Impact]: Who loses and who wins from this?
        
        TONE: Authoritative, data-focused, no hype, no 'cringe' marketing words.
        """
        
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}]
        )
        article_content = completion.choices[0].message.content
        print("✅ Analysis finalized.")
    except Exception as e:
        print(f"❌ AI FAILED: {e}")
        return
    
    # 4. SAVE TO SUPABASE
    headers_db = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "title": latest_story['title'],
        "content": article_content,
        "category": "Market Intel",
        "source_url": latest_story['url']
    }
    
    try:
        r = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=headers_db, json=payload)
        if r.status_code == 201:
            print("🎉 SUCCESS: Professional report published!")
        else:
            print(f"⚠️ DB Error: {r.text}")
    except Exception as e:
        print(f"❌ DB SAVE FAILED: {e}")

if __name__ == "__main__":
    run_news_bot()
