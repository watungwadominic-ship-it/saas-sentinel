import os
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# SETUP KEYS
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_PASS = os.environ.get("GMAIL_PASS") # Matches the YAML 'env' name

def send_weekly_newsletter():
    print("🚀 SaaS Sentinel: Fetching subscribers...")
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    
    try:
        # 1. Fetch Subscribers
        sub_res = requests.get(f"{SUPABASE_URL}/rest/v1/subscribers?select=email", headers=headers)
        emails = [row['email'] for row in sub_res.json()]
        
        # 2. Fetch News
        news_res = requests.get(f"{SUPABASE_URL}/rest/v1/news_articles?select=title,content&limit=3&order=created_at.desc", headers=headers)
        articles = news_res.json()
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return

    if not emails:
        print("📭 No subscribers found.")
        return

    # 3. Build the "Liquid Glass" Email
    html_content = f"""
    <div style="font-family: sans-serif; background: #0f172a; color: white; padding: 20px;">
        <h1 style="color: #38bdf8;">SaaS Sentinel Weekly</h1>
        <hr style="border: 0.5px solid #334155;">
    """
    for art in articles:
        html_content += f"<h3>{art['title']}</h3><p>{art['content'][:250]}...</p><br>"
    html_content += "</div>"

    # 4. Send via SMTP
    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(GMAIL_USER, GMAIL_PASS)
        
        for email in emails:
            msg = MIMEMultipart()
            msg['From'] = f"SaaS Sentinel <{GMAIL_USER}>"
            msg['To'] = email
            msg['Subject'] = "Your Weekly SaaS Sentinel Update"
            msg.attach(MIMEText(html_content, 'html'))
            server.send_message(msg)
            
        server.quit()
        print(f"🎉 SUCCESS: Sent to {len(emails)} subscribers!")
    except Exception as e:
        print(f"❌ GMAIL ERROR: {e}")

if __name__ == "__main__":
    send_weekly_newsletter()
