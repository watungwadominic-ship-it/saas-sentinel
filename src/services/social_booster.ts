/**
 * Dynamic Social Media Engagement Booster for SaaS Sentinel
 * Automatically maps entities and companies inside articles to their verified social handles
 * on Twitter/Threads/LinkedIn, and appends high-traffic hashtags and opinionated CTAs.
 */

const SOCIAL_MAPPINGS: Record<string, string> = {
  "microsoft": "@microsoft",
  "salesforce": "@salesforce",
  "openai": "@openai",
  "stripe": "@stripe",
  "google": "@google",
  "meta": "@meta",
  "apple": "@apple",
  "nvidia": "@nvidia",
  "figma": "@figma",
  "adobe": "@adobe",
  "hubspot": "@hubspot",
  "shopify": "@shopify",
  "slack": "@slack",
  "databricks": "@databricks",
  "snowflake": "@snowflake",
  "zoom": "@zoom",
  "canva": "@canva",
  "atlassian": "@atlassian",
  "gitlab": "@gitlab",
  "github": "@github",
  "notion": "@notion",
  "y combinator": "@ycombinator",
  "yc": "@ycombinator",
  "sam altman": "@sama",
  "elon musk": "@elonmusk",
  "zuckerberg": "@zuck",
  "anthropic": "@anthropic_co",
  "klarna": "@klarna",
  "vanta": "@vanta",
  "rippling": "@rippling",
  "clickup": "@clickup",
  "deel": "@deel",
  "gusto": "@gusto"
};

export interface SocialBoostResult {
  mentions: string[];
  tags: string[];
  cta: string;
}

export function getSocialBoost(title: string, summary: string, category?: string): SocialBoostResult {
  const searchText = `${title} ${summary}`.toLowerCase();
  const mentions: string[] = [];

  for (const [key, handle] of Object.entries(SOCIAL_MAPPINGS)) {
    if (searchText.includes(key)) {
      mentions.push(handle);
    }
  }

  // Deduplicate mentions
  const uniqueMentions = Array.from(new Set(mentions));

  // Determine targeted tags based on category
  const tags = ["#SaaS", "#B2B", "#Startups", "#SaaSSentinel"];
  if (category) {
    const cat = category.toLowerCase();
    if (cat.includes("ai") || cat.includes("artificial") || cat.includes("bullish")) {
      tags.push("#AI", "#GenerativeAI", "#Tech", "#LLMs");
    } else if (cat.includes("fund") || cat.includes("venture") || cat.includes("m&a")) {
      tags.push("#Funding", "#VentureCapital", "#VC", "#Investing", "#MAndA");
    } else if (cat.includes("growth") || cat.includes("market") || cat.includes("plg")) {
      tags.push("#PLG", "#GrowthHacking", "#Marketing", "#Sales");
    } else if (cat.includes("strategy") || cat.includes("product") || cat.includes("enterprise")) {
      tags.push("#BusinessStrategy", "#ProductManagement", "#Enterprise", "#Leadership");
    }
  }

  // Deduplicate tags
  const uniqueTags = Array.from(new Set(tags));

  // Engaging CTAs to drive replies and shares
  const ctas = [
    "How does this development align with your Q3 SaaS strategy?",
    "What’s your perspective on this strategic transition?",
    "A remarkable milestone in the B2B tech landscape. Thoughts?",
    "Essential reading for B2B executives and product builders.",
    "Our market analysis has the full breakdown. How are you adapting?"
  ];

  // Select a CTA deterministically
  const ctaIndex = title.length % ctas.length;
  const cta = ctas[ctaIndex];

  return {
    mentions: uniqueMentions,
    tags: uniqueTags,
    cta
  };
}
