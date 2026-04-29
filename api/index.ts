import app from '../server';

export default async function handler(req: any, res: any) {
  console.log(`[API] ${req.method} ${req.url} - Request starting...`);
  try {
    // If the req is for sitemap or robots, manually invoke the handlers if needed?
    // No, Express should handle it if the middleware is set up correctly.
    return app(req, res);
  } catch (err: any) {
    console.error(`[CRITICAL] API Handler Error:`, err);
    res.status(500).json({ 
      error: "Internal Server Error", 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
