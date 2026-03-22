import os
import datetime
import google.generativeai as genai

# Setup
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

def fetch_top_saas_news(top_articles_context=""):
    try:
        # 1. Check the Day & Set Timeframe
        now = datetime.datetime.now()
        is_weekend = now.weekday() >= 5  # 5 is Saturday, 6 is Sunday
        hours_back = 72 if is_weekend else 24

        # 2. Logging for GitHub Actions
        mode = "Weekend Mode" if is_weekend else "Standard Mode"
        print(f"{mode}: Fetching news from the last {hours_back} hours...")

        # 3. Construct the Prompt
        query = "(SaaS OR 'Enterprise AI' OR 'Cloud Computing') AND (Launch OR Funding OR Update)"
        
        prompt = f"""
        Search for the top 5 SaaS news stories from the last {hours_back} hours using: "{query}".
        
        FALLBACK: If no significant news is found, re-analyze these recent articles and 
        generate a 'Weekly Sentiment' summary instead:
        {top_articles_context if top_articles_context else "Summarize the major SaaS trend of the current week."}
        """

        # 4. Use the Search Tool
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash", # Most stable for Free Tier
            tools=[{"google_search_queries": {}}]
        )
        
        response = model.generate_content(prompt)
        return response.text

    except Exception as e:
        print(f"Error: {e}")
        return "No relevant news found."
