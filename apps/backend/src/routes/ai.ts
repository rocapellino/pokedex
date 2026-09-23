import express, { Request, Response } from 'express';
import {
  generateDiagram,
  generateMockup,
  generateImage,
} from '../services/ai.js';
import {
  aiRateLimiter,
  aiRateLimiterStandard,
  aiDailyQuotaLimiter,
} from '../middleware/rate-limiter.js';
import { verifyAIKey } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const aiRouter = express.Router();

// ---------------------------------------------------------------------------
// Google AI Studio (Gemini) Endpoints con Rate Limit Minuto, Cuota Diaria y Auth
// ---------------------------------------------------------------------------
aiRouter.post('/api/v1/ai/diagram', aiRateLimiterStandard, aiRateLimiter, aiDailyQuotaLimiter, verifyAIKey, asyncHandler(async (req: Request, res: Response) => {
  const { prompt, diagram_type } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'El campo prompt es requerido y debe ser texto' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);
  const result = await generateDiagram(cleanPrompt, diagram_type);
  res.json(result);
}));

aiRouter.post('/api/v1/ai/mock', aiRateLimiterStandard, aiRateLimiter, aiDailyQuotaLimiter, verifyAIKey, asyncHandler(async (req: Request, res: Response) => {
  const { prompt, framework } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'El campo prompt es requerido y debe ser texto' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);
  const result = await generateMockup(cleanPrompt, framework);
  res.json(result);
}));

aiRouter.post('/api/v1/ai/image', aiRateLimiterStandard, aiRateLimiter, aiDailyQuotaLimiter, verifyAIKey, asyncHandler(async (req: Request, res: Response) => {
  const { prompt, aspect_ratio } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'El campo prompt es requerido y debe ser texto' });
  }
  const cleanPrompt = prompt.trim().slice(0, 1000);
  const result = await generateImage(cleanPrompt, aspect_ratio);
  res.json(result);
}));
