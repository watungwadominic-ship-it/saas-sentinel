{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": { "distDir": "dist" }
    },
    {
      "src": "server.ts",
      "use": "@vercel/node",
      "config": {
        "includeFiles": ["dist/**", "index.html"]
      }
    }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/server.ts" },
    {
      "src": "/(.*)",
      "has": [{ "type": "query", "key": "_cookie_check" }],
      "dest": "/server.ts"
    },
    {
      "src": "/(.*)",
      "has": [
        {
          "type": "header",
          "key": "User-Agent",
          "value": ".*(bot|googlebot|linkedin|facebook|twitter|slack|whatsapp|telegram|crawler|spider|archiver|curl|wget|bingbot|yandex|baiduspider|duckduckbot|facebot|ia_archiver|Apache-HttpClient|LinkedInBot|facebookexternalhit|Embedly|quora link preview|showyoubot|outbrain|pinterest|vkShare|W3C_Validator|redditbot|Applebot|Discordbot|Discord-GTM).*"
        }
      ],
      "dest": "/server.ts"
    },
    { "src": "/(.*)", "has": [{ "type": "query", "key": "article" }], "dest": "/server.ts" },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/server.ts" }
  ]
}
