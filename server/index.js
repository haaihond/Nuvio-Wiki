import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const CACHE_FILE = join(__dirname, 'cache.json');

if (!process.env.GEMINI_API_KEY) {
  console.error('❌  GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Helpers ─────────────────────────────────────────────────────────────

/** Read the cached-content name written by refresh-cache.js */
function getCacheName() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    return data.name || null;
  } catch {
    return null;
  }
}

/** System prompt used when there is NO cache (fallback) */
const FALLBACK_SYSTEM = `You are the Nuvio Wiki Assistant. You help users with questions about Nuvio.
However, the wiki content cache has not been loaded yet. Please tell the user:
"The wiki knowledge base hasn't been loaded yet. The site administrator needs to run the cache refresh script. In the meantime, I can only provide very general guidance about Nuvio."
Keep answers brief and honest about your limited knowledge.`;

/** Build the system instruction for the model */
const WIKI_SYSTEM = `You are the Nuvio Wiki Assistant, a helpful AI that answers questions exclusively about Nuvio based on the wiki documentation provided in your context.

Rules:
1. ONLY answer questions about Nuvio, its features, installation, settings, addons, integrations, and troubleshooting.
2. If asked about unrelated topics, politely say: "I can only help with Nuvio-related questions. Feel free to ask about installation, settings, addons, or troubleshooting!"
3. Link heavily and frequently to the relevant wiki page routes using markdown links (e.g. [Quick Start Guide](/quick-start), [iOS Installation](/installation/ios), [Debrid Settings](/integrations/debrid)). Provide links for almost every step or resource mentioned.
4. Keep answers extremely short, brief, and to the point. Do not write long explanations; summarize key points in a few bullet points or a single paragraph, and point the user directly to the linked wiki guides for full details.
5. If the wiki doesn't cover a topic, say so honestly and suggest checking the Discord community.
6. Never make up features or information not present in the wiki content.
7. Format your responses in markdown. Use **bold**, bullet points, and code blocks where appropriate.
8. When listing steps, use numbered lists for clarity.`;

// ── Express app ─────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '64kb' }));

// Rate limiters
const perMinute = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment before asking again.' },
  keyGenerator: (req) => req.ip
});

const perHour = rateLimit({
  windowMs: 60 * 60_000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Hourly limit reached. Please try again later.' },
  keyGenerator: (req) => req.ip
});

// ── Routes ──────────────────────────────────────────────────────────────

app.get('/api/ai/health', (_req, res) => {
  const cacheName = getCacheName();
  res.json({
    status: 'ok',
    model: GEMINI_MODEL,
    cacheLoaded: !!cacheName,
    cacheName: cacheName || null
  });
});

app.post('/api/ai/chat', perMinute, perHour, async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Validate messages
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({ error: 'Each message must have role and content' });
      }
      if (!['user', 'model'].includes(msg.role)) {
        return res.status(400).json({ error: 'Role must be "user" or "model"' });
      }
    }

    // The last message must be from the user
    if (messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'Last message must be from user' });
    }

    // Cap conversation length to prevent abuse
    if (messages.length > 30) {
      return res.status(400).json({ error: 'Conversation too long. Please start a new chat.' });
    }

    const cacheName = getCacheName();

    // Build the request config — NO web search tools
    const config = {
      // Explicitly disable all tools / grounding to prevent web search
      tools: [],
    };

    if (cacheName) {
      config.cachedContent = cacheName;
    } else {
      // No cache — use fallback system prompt
      config.systemInstruction = FALLBACK_SYSTEM;
    }

    // Convert messages to Gemini format
    const contents = messages.map((msg) => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx: disable buffering
    res.flushHeaders();

    // Stream the response
    const stream = await ai.models.generateContentStream({
      model: GEMINI_MODEL,
      contents,
      config
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat error:', err);

    // If headers haven't been sent, send JSON error
    if (!res.headersSent) {
      const status = err.status || err.httpStatusCode || 500;
      return res.status(status).json({
        error: err.message || 'An error occurred while processing your request.'
      });
    }

    // If streaming already started, send error event
    res.write(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`);
    res.end();
  }
});

// ── Start ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const cacheName = getCacheName();
  console.log(`\n🤖  Nuvio Wiki AI server running on http://localhost:${PORT}`);
  console.log(`📦  Model: ${GEMINI_MODEL}`);
  console.log(`🔗  CORS origin: ${ALLOWED_ORIGIN}`);
  if (cacheName) {
    console.log(`✅  Context cache loaded: ${cacheName}`);
  } else {
    console.log(`⚠️   No context cache found. Run: npm run refresh-cache`);
  }
  console.log('');
});
