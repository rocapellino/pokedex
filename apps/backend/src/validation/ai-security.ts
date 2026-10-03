import { z } from 'zod';

export const AIMockupResponseSchema = z.object({
  html_code: z.string().max(65536, 'El código HTML generado supera el límite permitido de 64KB'),
  framework: z.string().max(50).optional(),
  explanation: z.string().max(1000).optional(),
});

/**
 * Sanitiza y valida estructuralmente fragmentos HTML generados por modelos de IA.
 * Neutraliza vectores ejecutables (<script>, eventos inline on*, esquemas javascript/vbscript, iframes).
 */
export function sanitizeAIHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  // 1. Limitar longitud máxima de salida (64KB)
  const trimmed = rawHtml.slice(0, 65536).trim();

  // 2. Rechazo explícito de etiquetas ejecutables y de incrustación
  if (/<script\b|<\/script/i.test(trimmed)) {
    console.warn('[AI Security] Salida de IA rechazada: contiene etiquetas <script>.');
    return '';
  }

  if (/<(?:iframe|object|embed|frame|frameset|applet|base|link|meta)\b/i.test(trimmed)) {
    console.warn('[AI Security] Salida de IA rechazada: contiene elementos incrustados no permitidos.');
    return '';
  }

  // 3. Rechazo explícito de pseudo-protocolos en atributos
  if (/(?:href|src|action)\s*=\s*(?:["']\s*)?(?:javascript|vbscript|data\s*:\s*text\/html)/i.test(trimmed)) {
    console.warn('[AI Security] Salida de IA rechazada: contiene pseudo-protocolos peligrosos.');
    return '';
  }

  // 4. Rechazo explícito de manejadores de eventos en línea (onload, onerror, onclick, etc.)
  if (/\son[a-z]+\s*=/i.test(trimmed)) {
    console.warn('[AI Security] Salida de IA rechazada: contiene manejadores de eventos inline.');
    return '';
  }

  return trimmed;
}

/**
 * Sanitiza y neutraliza vectores comunes de Prompt Injection e intentos de manipulación de contexto.
 */
export function sanitizePrompt(rawPrompt: string, maxLength = 500): string {
  if (!rawPrompt || typeof rawPrompt !== 'string') return '';

  // 1. Limitar longitud máxima para prevenir DoS y agotamiento desmedido de tokens
  let cleaned = rawPrompt.slice(0, maxLength);

  // 2. Neutralizar bloques de código markdown que intenten cerrar delimitadores
  cleaned = cleaned.replace(/```/g, "'''");

  // 3. Neutralizar prefijos comunes de suplantación de roles LLM
  cleaned = cleaned.replace(/\b(system|assistant|human|user)\s*:/gi, '[role_removed]:');

  // 4. Neutralizar frases de jailbreak / desobediencia de instrucciones
  cleaned = cleaned.replace(
    /\b(ignore|forget|disregard)\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/gi,
    '[instruccion_neutralizada]'
  );

  return cleaned.trim();
}
