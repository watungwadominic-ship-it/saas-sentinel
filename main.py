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

def post_to_linkedin(text, title, url, summary):
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
        
        # Using the 'content' block with an 'article' source is the most reliable 
        # way to trigger a link preview with an image.
        post_data = {
            "author": LINKEDIN_PERSON_URN,
            "commentary": text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": []
            },
            "content": {
                "article": {
                    "source": url,
                    "title": title,
                    "description": summary[:200]
                }
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

def is_relevant_saas_news(client, title, description):
    """Uses AI to filter out non-SaaS/B2B news."""
    try:
        prompt = f"Is the following news story specifically about B2B SaaS, Enterprise Software, or Cloud Infrastructure? Answer with ONLY 'YES' or 'NO'.\n\nTitle: {title}\nDescription: {description}"
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )
        answer = completion.choices[0].message.content.strip().upper()
        return "YES" in answer
    except:
        return True # Default to true if AI check fails

def run_news_bot():
    print("🚀 SaaS Sentinel: Initiating Elite Market Intelligence Scan...")
    
    if not GROQ_API_KEY:
        print("❌ Error: GROQ_API_KEY is not set.")
        return
        
    client = Groq(api_key=GROQ_API_KEY)

    # 1. Fetch News - Refined query to be more specific
    search_query = '("B2B SaaS" OR "Enterprise AI" OR "Cloud Infrastructure" OR "SaaS Funding")'
    news_url = f"https://newsapi.org/v2/everything?q={search_query}&language=en&sortBy=publishedAt&apiKey={NEWS_API_KEY}"
    
    try:
        news_response = requests.get(news_url)
        news_data = news_response.json()
        articles = news_data.get("articles", [])[:10] 
    except Exception as e:
        print(f"❌ NewsAPI Error: {e}")
        return

    processed_count = 0
    for latest in articles:
        if processed_count >= 3: break # Limit to 3 high-quality posts

        title = latest.get("title")
        url = latest.get("url")
        description = latest.get("description", "")
        image_url = latest.get("urlToImage")
        
        if not title or not url or "[Removed]" in title: continue

        # RELEVANCE FILTER
        if not is_relevant_saas_news(client, title, description):
            print(f"⏭️ Skipping (Irrelevant): {title[:40]}...")
            continue

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
                    temperature=0.5,
                    messages=[
                        {
                            "role": "system", 
                            "content": "You are a SaaS Market Analyst. Return a flat JSON object with string values only."
                        },
                        {
                            "role": "user", 
                            "content": (
                                f"News: {title}\n"
                                f"Context: {description}\n\n"
                                "Return JSON: {'feed_summary': '...', 'strategic_analysis': '...', 'impact': 'High/Medium/Low', 'sentiment': 'BULLISH/BEARISH/NEUTRAL'}"
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

        analysis_text = str(ai_data.get('strategic_analysis', ""))
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
            
            social_text = f"📡 SaaS Intelligence: {title}\n\n{summary_text[:150]}...\n\nRead the full analysis: {article_url}\n\n#SaaS #B2B #MarketIntelligence"
            
            post_to_linkedin(social_text, title, article_url, summary_text)
            processed_count += 1
        except Exception as e:
            print(f"❌ Supabase Save Error: {e}")

    print(f"\n✨ Scan Complete. {processed_count} new intelligence reports generated.")

if __name__ == "__main__":
    run_news_bot()
