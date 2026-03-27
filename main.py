import os
import requests
import json
import random
from datetime import datetime
from groq import Groq

# Configuration from Environment Variables
NEWS_API_KEY = os.getenv("NEWS_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
LINKEDIN_ACCESS_TOKEN = os.getenv("LINKEDIN_ACCESS_TOKEN")
LINKEDIN_PERSON_URN = os.getenv("LINKEDIN_PERSON_URN")

def post_to_linkedin(text, title, url, image_url=None):
    if not all([LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_URN]):
        print("⏭️ Skipping LinkedIn: Credentials missing.")
        return
    try:
        clean_token = str(LINKEDIN_ACCESS_TOKEN).strip()
        headers = {
            "Authorization": f"Bearer {clean_token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0"
        }
        
        post_data = {
            "author": LINKEDIN_PERSON_URN,
            "commentary": text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": []
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False
        }
        response = requests.post("https://api.linkedin.com/v2/posts", headers=headers, json=post_data)
        if response.status_code in [200, 201]:
            print("💼 LinkedIn Post Successful")
        else:
            print(f"❌ LinkedIn Error: {response.text}")
    except Exception as e:
        print(f"❌ LinkedIn Error: {e}")

def run_news_bot():
    print("🚀 SaaS Sentinel: Initiating Elite Market Intelligence Scan...")
    
    if not GROQ_API_KEY:
        print("❌ Error: GROQ_API_KEY is not set.")
        return
        
    client = Groq(api_key=GROQ_API_KEY)

    # 1. Fetch News
    news_url = f"https://newsapi.org/v2/everything?q=SaaS+OR+B2B+Software+OR+Venture+Capital&language=en&sortBy=publishedAt&apiKey={NEWS_API_KEY}"
    try:
        news_response = requests.get(news_url)
        news_data = news_response.json()
        articles = news_data.get("articles", [])[:5] 
    except Exception as e:
        print(f"❌ NewsAPI Error: {e}")
        return

    processed_count = 0
    for latest in articles:
        title = latest.get("title")
        url = latest.get("url")
        image_url = latest.get("urlToImage")
        
        if not title or not url or "[Removed]" in title: continue

        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}", 
            "Content-Type": "application/json"
        }
        
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
                    temperature=0.5, # Lower temperature for better JSON compliance
                    messages=[
                        {
                            "role": "system", 
                            "content": "You are a SaaS Market Analyst. You MUST return a flat JSON object. Do NOT use nested objects or lists for values. All values must be strings."
                        },
                        {
                            "role": "user", 
                            "content": (
                                f"News: {title}\n"
                                f"Context: {latest.get('description', '')}\n\n"
                                "Return JSON with these exact keys: \n"
                                "1. 'feed_summary': A string (100 words).\n"
                                "2. 'strategic_analysis': A single string containing 3 paragraphs.\n"
                                "3. 'impact': 'High', 'Medium', or 'Low'.\n"
                                "4. 'sentiment': 'BULLISH', 'BEARISH', or 'NEUTRAL'."
                            )
                        }
                    ],
                    response_format={"type": "json_object"}
                )
                ai_data = json.loads(completion.choices[0].message.content)
                break
            except Exception as e:
                print(f"🔄 AI Attempt {attempt+1} failed: {e}")

        if not ai_data: continue

        # Safety check: If AI returned a dictionary for analysis, flatten it
        analysis_raw = ai_data.get('strategic_analysis', "")
        if isinstance(analysis_raw, dict):
            analysis_text = " ".join([str(v) for v in analysis_raw.values()])
        else:
            analysis_text = str(analysis_raw)

        summary_text = str(ai_data.get('feed_summary', ""))
        
        payload = {
            "title": title,
            "summary": summary_text,
            "content": analysis_text,
            "analysis_content": analysis_text,
            "confidence_score": random.randint(95, 99),
            "strategic_impact": ai_data.get('impact', 'High'),
            "category": ai_data.get('sentiment', 'BULLISH'), 
            "image_url": image_url,
            "source_url": latest.get('url'),
            "published_at": latest.get('publishedAt') or datetime.now().isoformat()
        }
        
        try:
            save_headers = headers.copy()
            save_headers["Prefer"] = "return=representation"
            save_response = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=save_headers, json=payload)
            save_response.raise_for_status()
            saved_data = save_response.json()
            article_id = saved_data[0]['id'] if saved_data else None
            
            print(f"✅ Intelligence Logged: {title[:50]}...")
            
            app_url = os.getenv("APP_URL", "https://saas-sentinel-cyan.vercel.app")
            article_url = f"{app_url}/?article={article_id}" if article_id else f"{app_url}/"
            
            display_summary = summary_text[:150] if summary_text else ""
            social_text = f"📡 SaaS Intelligence: {title}\n\n{display_summary}...\n\nRead more: {article_url}\n\n#SaaS #AI #MarketIntel"
            
            post_to_linkedin(social_text, title, article_url, image_url)
            processed_count += 1
        except Exception as e:
            print(f"❌ Supabase Save Error: {e}")

    print(f"\n✨ Scan Complete. {processed_count} new intelligence reports generated.")

if __name__ == "__main__":
    run_news_bot()
