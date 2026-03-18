import os
import requests

# SETUP KEYS
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")

def send_weekly_newsletter():
    # 1. Fetch Subscribers
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    sub_response = requests.get(f"{SUPABASE_URL}/rest/v1/subscribers?select=email", headers=headers)
    emails = [row['email'] for row in sub_response.json()]
    
    # 2. Fetch Top 3 Stories
    news_response = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?select=title,content&limit=3&order=created_at.desc", headers=headers)
    articles = news_response.json()
    
    # 3. Build Email Content
    html_content = "<h1>SaaS Sentinel Weekly Digest</h1>"
    for art in articles:
        html_content += f"<h3>{art['title']}</h3><p>{art['content'][:200]}...</p><hr>"
    
    # 4. Send via Resend
    for email in emails:
        resend_payload = {
            "from": "SaaS Sentinel <newsletter@yourdomain.com>",
            "to": email,
            "subject": "Your Weekly SaaS Intelligence Update",
            "html": html_content
        }
        requests.post("https://api.resend.com/emails", 
                      headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                      json=resend_payload)
    print(f"🎉 Newsletter sent to {len(emails)} subscribers!")

if __name__ == "__main__":
    send_weekly_newsletter()
