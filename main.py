import os
import json
import requests
from groq import Groq
from datetime import datetime, timedelta
import random
import time

# 1. Configuration
# Ensure these are set in your environment or .env file
# GROQ_API_KEY: Get yours at https://console.groq.com/keys
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

# Social Media Credentials
LINKEDIN_ACCESS_TOKEN = os.environ.get("LINKEDIN_ACCESS_TOKEN")
LINKEDIN_PERSON_URN = os.environ.get("LINKEDIN_PERSON_URN")

def post_to_linkedin(text, title, url, summary=None, image_url=None):
    if not all([LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_URN]):
        print("⏭️ Skipping LinkedIn: Credentials missing.")
        return
    try:
        # Clean token to remove any accidental whitespace/newlines
        clean_token = str(LINKEDIN_ACCESS_TOKEN).strip()
        headers = {
            "Authorization": f"Bearer {clean_token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0"
        }
        
        # Using a query parameter for cache busting as it's more standard for scrapers
        # and less likely to confuse path-based routing.
        import time
        from datetime import datetime
        cache_buster = int(datetime.now().timestamp())
        
        # Ensure we don't have multiple question marks or malformed query strings
        if "?" in url:
            final_url = f"{url}&ls={cache_buster}&force_bot=true"
        else:
            final_url = f"{url}?ls={cache_buster}&force_bot=true"
        
        print(f"DEBUG: Final URL for LinkedIn: {final_url}")
        
        print(f"🔗 Sharing URL: {final_url}")
        
        # We explicitly include the 'content' block with 'article' source. 
        # This is the most reliable way to trigger a link preview with an image.
        post_data = {
            "author": LINKEDIN_PERSON_URN,
            "commentary": text.replace(url, final_url),
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": []
            },
            "content": {
                "article": {
                    "source": final_url,
                    "title": title,
                    "description": (summary or title)[:250]
                }
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False
        }
        
        # Small delay to ensure Supabase is fully synced and server is ready
        # Increased to 15s to handle Vercel cold starts and database sync better
        print(f"⏳ Waiting 15s for database sync and server readiness...")
        time.sleep(15)
        
        print(f"📡 Sending to LinkedIn: {title[:50]}...")
        print(f"🔗 Final Sharing URL: {final_url}")
        print(f"🖼️ Image URL being shared: {image_url}")
        
        # Log the full payload for debugging (masking the token)
        debug_payload = post_data.copy()
        print(f"📦 Payload: {json.dumps(debug_payload, indent=2)}")
        
        response = requests.post("https://api.linkedin.com/v2/posts", headers=headers, json=post_data)
        if response.status_code in [200, 201]:
            print("💼 LinkedIn Post Successful")
        else:
            print(f"❌ LinkedIn Error {response.status_code}: {response.text}")
    except Exception as e:
        print(f"❌ LinkedIn Error: {e}")

def run_news_bot():
    print("🚀 SaaS Sentinel: Initiating Elite Market Intelligence Scan...")
    
    # Initialize Groq Client once
    if not GROQ_API_KEY:
        print("❌ Error: GROQ_API_KEY is not set.")
        return
    client = Groq(api_key=GROQ_API_KEY)

    now = datetime.now()
    # Fetch news from the last 2 days
    start_date = (now - timedelta(days=2)).strftime('%Y-%m-%d')

    # 2. Fetch News
    # Broad query for SaaS and Enterprise AI
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

    # Process top 5 articles to find the most relevant ones
    processed_count = 0
    for latest in articles[:10]:
        if processed_count >= 3: # Limit to 3 fresh insights per run
            break

        title = latest['title']
        if not title or "[Removed]" in title:
            continue
            
        # Duplicate Check
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
                    temperature=0.7, 
                    messages=[
                        {
                            "role": "system", 
                            "content": "You are a SaaS Strategy Consultant. Return ONLY a valid JSON object."
                        },
                        {
                            "role": "user", 
                            "content": (
                                f"News: {title}\n"
                                f"Context: {latest.get('description', '')}\n\n"
                                "Return JSON with these keys: 'feed_summary' (100 words), 'strategic_analysis' (3 paragraphs), 'impact' (High/Medium/Low), 'sentiment' (BULLISH/BEARISH/NEUTRAL)."
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
            print(f"❌ Failed to generate AI analysis for: {title}")
            continue

        # Clean and format the analysis content
        raw_analysis = ai_data.get('strategic_analysis', "")
        if isinstance(raw_analysis, dict):
            # If the AI returns a dict instead of a string, join the values
            clean_analysis = "\n\n".join([str(v) for v in raw_analysis.values()])
        else:
            clean_analysis = str(raw_analysis)

        # 4. Save to Supabase
        # Mapping the AI fields to the database schema
        summary_text = str(ai_data.get('feed_summary', ""))
        
        # Ensure image URL is absolute and has proper dimensions
        image_url = latest.get('urlToImage')
        if not image_url:
            # Better fallback with proper dimensions for social media
            image_url = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200&h=630"
        
        source_url = latest.get('url', '')
        if image_url and not image_url.startswith('http'):
            if image_url.startswith('//'):
                image_url = f"https:{image_url}"
            elif source_url:
                from urllib.parse import urljoin
                image_url = urljoin(source_url, image_url)
        
        # If it's an Unsplash URL, ensure it has the right dimensions
        if "unsplash.com" in image_url and ("w=" not in image_url or "h=" not in image_url):
            base_img = image_url.split('?')[0]
            image_url = f"{base_img}?auto=format&fit=crop&q=80&w=1200&h=630"
            
        payload = {
            "title": title,
            "content": clean_analysis.strip(),
            "category": ai_data.get('sentiment', 'BULLISH'), 
            "image_url": image_url,
            "created_at": latest.get('publishedAt') or datetime.now().isoformat()
        }
        
        try:
            # Change Prefer header to return representation so we get the ID
            save_headers = headers.copy()
            save_headers["Prefer"] = "return=representation"
            save_response = requests.post(f"{SUPABASE_URL}/rest/v1/news_articles", headers=save_headers, json=payload)
            
            if save_response.status_code >= 400:
                print(f"❌ Supabase Error Details: {save_response.text}")
                
            save_response.raise_for_status()
            saved_data = save_response.json()
            article_id = saved_data[0]['id'] if saved_data else None
            
            print(f"✅ Intelligence Logged: {title[:50]}...")
            print(f"🖼️ Image URL: {image_url}")
            print(f"🆔 Article ID: {article_id}")
            
            # Use path-based URLs which are less likely to trigger infrastructure cookie checks
            # than query-parameter based URLs.
            shared_url = "https://ais-pre-k2zyhx7iw4f2x55hvxwlzg-10310046101.europe-west2.run.app"
            app_url = os.getenv("SHARED_APP_URL", shared_url)
            article_url = f"{app_url}/article/{article_id}" if article_id else f"{app_url}/"
        
            display_summary = summary_text[:200] if summary_text else ""
            # Ensure there is a space after the URL to prevent social media scrapers from including trailing characters
            social_text = f"📡 SaaS Intelligence: {title}\n\n{display_summary}...\n\nRead more on SaaS Sentinel: {article_url} \n\n#SaaS #AI #MarketIntel"
            
            post_to_linkedin(social_text, title, article_url, summary_text, image_url)

            processed_count += 1
        except Exception as e:
            print(f"❌ Supabase Save Error: {e}")

    print(f"\n✨ Scan Complete. {processed_count} new intelligence reports generated.")

if __name__ == "__main__":
    run_news_bot()
