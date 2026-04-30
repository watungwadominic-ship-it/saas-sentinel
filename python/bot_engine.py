import os
import json
import time
import requests
from datetime import datetime
from supabase import create_client, Client
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://dpwkojtfeoxlpyevutfc.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'sb_publishable_WumEuqpPeooXrt1nkO9l_w_zWa37BgE') # Using the key from the project
APP_URL = os.getenv('SHARED_APP_URL', '').rstrip('/')

# Initialize Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print("❌ Error: GEMINI_API_KEY missing")
    exit(1)

# Initialize Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_saas_intelligence():
    print("🚀 SaaS Sentinel: Initiating Elite Market Intelligence Scan...")
    
    model = genai.GenerativeModel('gemini-3-flash-preview')
    query = "(SaaS OR 'Enterprise AI' OR 'Cloud Computing') AND (Launch OR Funding OR Update)"
    
    prompt = f"""Search for the top 3 most significant SaaS news stories from the last 24 hours using this query: "{query}". 
    For each story, provide a headline and a brief summary of the raw facts.
    Return the result as a JSON array of objects with 'title' and 'snippet'."""

    try:
        # Note: Google Search tool in Python SDK
        response = model.generate_content(
            prompt,
            tools=[{"google_search": {}}],
            generation_config={"response_mime_type": "application/json"}
        )
        
        stories = json.loads(response.text)
        print(f"📡 Found {len(stories)} potential intelligence sources.")
        return stories
    except Exception as e:
        print(f"❌ Error fetching news: {e}")
        return []

def analyze_and_save(story):
    title = story.get('title')
    snippet = story.get('snippet')
    
    print(f"\n🧠 Deep Analyzing: {title[:70]}...")
    
    model = genai.GenerativeModel('gemini-3-flash-preview')
    prompt = f"""Act as an Elite Senior SaaS Market Analyst. Analyze this news: {title}.
    
    Data Input: Headline: {title}, Snippet: {snippet}
    
    Return a JSON object with:
    - title: Punchy headline
    - content: Markdown analysis
    - category: "Market Analysis" or "Intelligence Feed"
    - breakdown: List of 3 facts
    - sentinel_take: 2 paragraphs of analysis
    - verdict: 1-sentence prediction
    - image_url: Just the Unsplash ID (after 'photo-')
    """
    
    try:
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        analysis = json.loads(response.text)
        
        # Prepare for database
        article_data = {
            "title": analysis.get('title'),
            "summary": analysis.get('sentinel_take')[:200] + "...",
            "content": analysis.get('content'),
            "category": analysis.get('category', 'Intelligence Feed'),
            "image_url": f"https://images.unsplash.com/photo-{analysis.get('image_url')}?auto=format&fit=crop&q=80&w=800",
            "metadata": {
                "breakdown": analysis.get('breakdown'),
                "sentinel_take": analysis.get('sentinel_take'),
                "verdict": analysis.get('verdict')
            },
            "source": "SaaS Sentinel Intelligence",
            "read_time": "4 min read",
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Check if already exists to avoid duplicates (naive check by title)
        existing = supabase.table("news_articles").select("id").eq("title", article_data["title"]).execute()
        
        if not existing.data:
            result = supabase.table("news_articles").insert(article_data).execute()
            article_id = result.data[0]['id']
            print(f"✅ Intelligence Logged: {title[:50]}...")
            print(f"🖼️ Image URL: {article_data['image_url']}")
            print(f"🆔 Article ID: {article_id}")
            
            # Print Sharing URL if we have APP_URL
            if APP_URL:
                print(f"🔗 Sharing URL: {APP_URL}/article/{article_id}")
        else:
            print(f"⏭️ Skipping: Intelligence already logged.")
            
    except Exception as e:
        print(f"❌ Error processing article: {e}")

def main():
    print("📈 SaaS Sentinel: Bot Life Cycle Started")
    stories = fetch_saas_intelligence()
    
    for story in stories:
        analyze_and_save(story)
        time.sleep(2) # Avoid rate limits
        
    print(f"\n✨ Scan Complete. {len(stories)} intelligence reports processed.")

if __name__ == "__main__":
    main()
