import os
import requests

def trigger_newsletter():
    app_url = os.getenv('APP_URL', 'https://saas-sentinel-cyan.vercel.app')
    cron_secret = os.getenv('CRON_SECRET', '')
    
    endpoint = f"{app_url}/api/cron/weekly-newsletter"
    
    print(f"Triggering Weekly Newsletter at: {endpoint}")
    
    headers = {
        'Authorization': f"Bearer {cron_secret}"
    }
    
    try:
        response = requests.post(endpoint, headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    trigger_newsletter()
