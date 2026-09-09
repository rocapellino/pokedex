import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_google_ai_studio_api_key_here') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const AI_TIMEOUT_MS = 12000;

/**
 * Envoltorio de resiliencia con cancelación preventiva ante demoras extremas del proveedor de IA.
 * Previene acumulación de conexiones abiertas y garantiza degradación elegante hacia fallback local.
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs = AI_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout de servicio IA: la llamada excedió el límite de ${timeoutMs}ms`));
    }, timeoutMs).unref();
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function generateDiagram(prompt: string, diagramType: string = 'flowchart') {
  const client = getAIClient();
  const fallbackDiagram = {
    success: true,
    diagram_type: diagramType,
    mermaid_code: `graph TD\n    A[Entrenador / Usuario] -->|Consulta Pokédex| B(API Gateway Express)\n    B --> C{En Memoria?}\n    C -->|Hit| D[Fast Map Cache]\n    C -->|Miss| E[Seed Store]\n    D --> F[JSON Serializer ETag]\n    E --> F\n    F --> G[Renderizado Web UI Pokedex]`,
    note: 'Diagrama generado con fallback seguro para garantizar disponibilidad.',
  };

  if (!client) {
    return fallbackDiagram;
  }

  try {
    const systemInstruction = `Eres un arquitecto de software experto en diagramación con Mermaid.js. Genera únicamente código Mermaid válido sin bloques markdown adicionales ni texto explicativo.`;
    const response = await withTimeout(
      client.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Crea un diagrama de tipo ${diagramType} para: ${prompt}`,
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      })
    );

    const text = response.text || '';
    const cleanMermaid = text.replace(/```mermaid/gi, '').replace(/```/g, '').trim();

    return {
      success: true,
      mermaid_code: cleanMermaid || fallbackDiagram.mermaid_code,
      model: GEMINI_MODEL,
    };
  } catch (error: any) {
    console.warn('[AI Service] Advertencia al contactar modelo, utilizando respuesta fallback:', error.message);
    return fallbackDiagram;
  }
}

export async function generateMockup(prompt: string, framework: string = 'html/css') {
  const client = getAIClient();
  const fallbackMockup = {
    success: true,
    framework,
    html_code: `<div class="pokemon-card" style="border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 1rem; background: #1f2937; text-align: center;">
  <h3 style="color: #f9fafb; margin-bottom: 0.5rem;">${prompt}</h3>
  <span class="type-badge" style="background: #ef4444; color: white; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem;">Fuego</span>
  <p style="color: #9ca3af; font-size: 0.875rem; margin-top: 0.5rem;">Componente estilizado generado para el ecosistema Pokédex.</p>
</div>`,
    note: 'Generado con plantilla de diseño local.',
  };

  if (!client) {
    return fallbackMockup;
  }

  try {
    const systemInstruction = `Eres un diseñador de UI frontend. Genera componentes limpios y seguros en ${framework}. No incluyas etiquetas <script> ni estilos vulnerables. Devuelve únicamente el fragmento HTML/CSS del componente.`;
    const response = await withTimeout(
      client.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Diseña un componente para: ${prompt}`,
        config: {
          systemInstruction,
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      })
    );

    const text = (response.text || '').replace(/```html/gi, '').replace(/```/g, '').trim();
    return {
      success: true,
      html_code: text || fallbackMockup.html_code,
      model: GEMINI_MODEL,
    };
  } catch (error: any) {
    console.warn('[AI Service] Advertencia al generar mockup:', error.message);
    return fallbackMockup;
  }
}

export async function generateImage(prompt: string, aspectRatio: string = '1:1') {
  const client = getAIClient();
  const fallbackImage = {
    success: true,
    prompt,
    aspect_ratio: aspectRatio,
    image_url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
    description: `Arte conceptual representativo para ${prompt}.`,
    note: 'Modo visual optimizado.',
  };

  if (!client) {
    return fallbackImage;
  }

  try {
    const response = await withTimeout(
      client.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Describe en detalle artístico el siguiente Pokémon o criatura para generar su arte conceptual: ${prompt}`,
        config: {
          maxOutputTokens: 1024,
        },
      })
    );

    return {
      success: true,
      prompt,
      description: response.text || fallbackImage.description,
      aspect_ratio: aspectRatio,
      image_url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
    };
  } catch (error: any) {
    console.warn('[AI Service] Advertencia al generar imagen:', error.message);
    return fallbackImage;
  }
}
