import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { INITIAL_POKEMONS, Pokemon } from "./src/pokemonData.js";

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";

// In-memory Pokémon store
let pokemons: Pokemon[] = JSON.parse(JSON.stringify(INITIAL_POKEMONS));

// Observability & Prometheus Metrics
const startTime = Date.now();
const requestCounts = new Map<string, number>();
const requestDurationSum = new Map<string, number>();
const requestDurationCount = new Map<string, number>();

// Middleware
app.use(cors());
app.use(express.json());

// Metrics Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqStart = Date.now();
  const endpoint = req.path;
  const method = req.method;

  res.on("finish", () => {
    const duration = (Date.now() - reqStart) / 1000;
    const status = res.statusCode;
    const key = `${method}|${endpoint}|${status}`;
    const durKey = `${method}|${endpoint}`;

    requestCounts.set(key, (requestCounts.get(key) || 0) + 1);
    requestDurationSum.set(durKey, (requestDurationSum.get(durKey) || 0) + duration);
    requestDurationCount.set(durKey, (requestDurationCount.get(durKey) || 0) + 1);
  });

  next();
});

// ============================================================================
// API Endpoints
// ============================================================================

// Health check
app.get("/healthz", (_req: Request, res: Response) => {
  res.type("text/plain").send("healthy\n");
});

// Metrics
app.get("/metrics", (_req: Request, res: Response) => {
  const uptimeSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const lines: string[] = [
    "# HELP pokedex_uptime_seconds Tiempo que la aplicacion ha estado activa en segundos.",
    "# TYPE pokedex_uptime_seconds gauge",
    `pokedex_uptime_seconds ${uptimeSec}`,
    "",
    "# HELP pokedex_total_pokemons Cantidad actual de Pokemon registrados.",
    "# TYPE pokedex_total_pokemons gauge",
    `pokedex_total_pokemons ${pokemons.length}`,
    "",
    "# HELP pokedex_http_requests_total Contador total de solicitudes HTTP recibidas.",
    "# TYPE pokedex_http_requests_total counter"
  ];

  for (const [key, count] of requestCounts.entries()) {
    const [m, ep, st] = key.split("|");
    lines.push(`pokedex_http_requests_total{method="${m}",endpoint="${ep}",status="${st}"} ${count}`);
  }

  lines.push(
    "",
    "# HELP pokedex_http_request_duration_seconds Latencia total de solicitudes HTTP procesadas.",
    "# TYPE pokedex_http_request_duration_seconds summary"
  );

  for (const [durKey, totalSec] of requestDurationSum.entries()) {
    const [m, ep] = durKey.split("|");
    const count = requestDurationCount.get(durKey) || 1;
    lines.push(`pokedex_http_request_duration_seconds_sum{method="${m}",endpoint="${ep}"} ${totalSec.toFixed(4)}`);
    lines.push(`pokedex_http_request_duration_seconds_count{method="${m}",endpoint="${ep}"} ${count}`);
  }

  res.type("text/plain").send(lines.join("\n") + "\n");
});

// Root route API JSON detection
app.get("/", (req: Request, res: Response, next: NextFunction) => {
  const accept = req.headers.accept || "";
  if (accept.includes("application/json") && !accept.includes("text/html")) {
    return res.json({
      mensaje: "¡Bienvenido a la API REST de Pokémon (Express Engine)!",
      version: "2.0.0",
      docs: "/docs",
      rutas_disponibles: {
        "GET /pokemons": "Lista todos los Pokémon",
        "GET /pokemons/{id}": "Obtiene un Pokémon por ID",
        "POST /pokemons": "Crea un nuevo Pokémon",
        "PUT /pokemons/{id}": "Actualiza un Pokémon por ID",
        "DELETE /pokemons/{id}": "Elimina un Pokémon por ID",
        "GET /healthz": "Healthcheck del Servicio",
        "GET /metrics": "Exportador de métricas Prometheus"
      }
    });
  }
  next();
});

// Pokémons List
app.get("/pokemons", (_req: Request, res: Response) => {
  res.json(pokemons);
});

// Pokémon by ID
app.get("/pokemons/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const pokemon = pokemons.find((p) => p.id === id);
  if (!pokemon) {
    return res.status(404).json({ detail: `Pokémon con id ${id} no encontrado` });
  }
  res.json(pokemon);
});

// Create Pokémon
app.post("/pokemons", (req: Request, res: Response) => {
  const body = req.body;
  if (!body.nombre) {
    return res.status(422).json({ detail: "El nombre es obligatorio" });
  }

  const highestId = pokemons.reduce((max, p) => Math.max(max, p.id || 0), 0);
  const newId = highestId + 1;

  const car = body.caracteristicas || {};
  const newPokemon: Pokemon = {
    id: newId,
    nombre: String(body.nombre).trim(),
    imagen: body.imagen || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${newId}.png`,
    caracteristicas: {
      peso: typeof car.peso === "number" ? car.peso : parseFloat(car.peso) || 10.0,
      altura: typeof car.altura === "number" ? car.altura : parseFloat(car.altura) || 1.0,
      fuerza: typeof car.fuerza === "number" ? car.fuerza : parseInt(car.fuerza, 10) || 50,
      edad: typeof car.edad === "number" ? car.edad : parseInt(car.edad, 10) || 4,
      categoria: car.categoria || "Pokémon",
      descripcion: car.descripcion || "Un nuevo Pokémon registrado en el catálogo.",
      habitat: car.habitat || body.habitat || "Desconocido"
    },
    habilidades: Array.isArray(body.habilidades) ? body.habilidades : (body.habilidades ? [String(body.habilidades)] : ["Adaptación"]),
    tipo: body.tipo || "Normal",
    tipos: Array.isArray(body.tipos) ? body.tipos : [body.tipo || "Normal"],
    habitat: body.habitat || car.habitat || "Desconocido",
    stats: body.stats || {
      hp: 50,
      attack: typeof car.fuerza === "number" ? car.fuerza : 50,
      defense: 50,
      sp_attack: 50,
      sp_defense: 50,
      speed: 50
    },
    evoluciones: Array.isArray(body.evoluciones) ? body.evoluciones : [
      {
        id: newId,
        nombre: String(body.nombre).trim(),
        etapa: "Base",
        metodo: null,
        imagen: body.imagen || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${newId}.png`
      }
    ]
  };

  pokemons.push(newPokemon);
  res.status(201).json(newPokemon);
});

// Update Pokémon
app.put("/pokemons/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const pokemon = pokemons.find((p) => p.id === id);
  if (!pokemon) {
    return res.status(404).json({ detail: `Pokémon con id ${id} no encontrado` });
  }

  const payload = req.body;
  if (payload.nombre !== undefined) pokemon.nombre = String(payload.nombre).trim();
  if (payload.imagen !== undefined) pokemon.imagen = String(payload.imagen).trim();
  if (payload.tipo !== undefined) {
    pokemon.tipo = String(payload.tipo).trim();
    if (!payload.tipos) {
      pokemon.tipos = [pokemon.tipo];
    }
  }
  if (payload.tipos !== undefined && Array.isArray(payload.tipos)) {
    pokemon.tipos = payload.tipos;
  }
  if (payload.habitat !== undefined) pokemon.habitat = String(payload.habitat).trim();
  if (payload.habilidades !== undefined && Array.isArray(payload.habilidades)) {
    pokemon.habilidades = payload.habilidades;
  }

  if (payload.caracteristicas && typeof payload.caracteristicas === "object") {
    const car = payload.caracteristicas;
    pokemon.caracteristicas = {
      ...pokemon.caracteristicas,
      ...(car.peso !== undefined && { peso: parseFloat(car.peso) || 0 }),
      ...(car.altura !== undefined && { altura: parseFloat(car.altura) || 0 }),
      ...(car.fuerza !== undefined && { fuerza: parseInt(car.fuerza, 10) || 0 }),
      ...(car.edad !== undefined && { edad: parseInt(car.edad, 10) || 0 }),
      ...(car.categoria !== undefined && { categoria: String(car.categoria) }),
      ...(car.descripcion !== undefined && { descripcion: String(car.descripcion) }),
      ...(car.habitat !== undefined && { habitat: String(car.habitat) })
    };
  }

  if (payload.stats && typeof payload.stats === "object") {
    pokemon.stats = { ...pokemon.stats, ...payload.stats };
  }

  res.json(pokemon);
});

// Delete Pokémon
app.delete("/pokemons/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const idx = pokemons.findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ detail: `Pokémon con id ${id} no encontrado` });
  }

  const [removed] = pokemons.splice(idx, 1);
  res.json({
    mensaje: `Pokémon con id ${id} eliminado correctamente`,
    pokemon_eliminado: removed
  });
});

// ============================================================================
// Google AI Studio Integration (Gemini SDK)
// ============================================================================
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_google_ai_studio_api_key_here") {
    return null;
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

// AI Flowchart Diagram Endpoint
app.post("/api/v1/ai/diagram", async (req: Request, res: Response) => {
  const { prompt, diagram_type = "flowchart" } = req.body;
  if (!prompt) {
    return res.status(400).json({ success: false, error: "El campo 'prompt' es requerido" });
  }

  const ai = getGenAI();
  if (!ai) {
    return res.json({
      success: true,
      mermaid_code: `graph TD;\n  A[${prompt}] --> B[Procesador Pokédex];\n  B --> C[Almacenamiento];\n  B --> D[Visualización];`,
      model: "mock-diagram"
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Genera un diagrama Mermaid del tipo ${diagram_type} para la siguiente descripción:\n${prompt}\nDevuelve únicamente el bloque de código Mermaid sin explicaciones adicionales.`,
    });
    const text = response.text || "";
    const cleanText = text.replace(/```mermaid/g, "").replace(/```/g, "").trim();
    res.json({
      success: true,
      mermaid_code: cleanText,
      model: "gemini-2.5-flash"
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Error al generar diagrama con Gemini" });
  }
});

// AI Mockup Endpoint
app.post("/api/v1/ai/mock", async (req: Request, res: Response) => {
  const { prompt, framework = "html/css" } = req.body;
  if (!prompt) {
    return res.status(400).json({ success: false, error: "El campo 'prompt' es requerido" });
  }

  const ai = getGenAI();
  if (!ai) {
    return res.json({
      success: true,
      html_code: `<div class="pokemon-card"><h3 class="pokemon-name">${prompt}</h3><p class="pokemon-type">Tipo Especial</p></div>`,
      framework
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Genera código de componente ${framework} limpio y accesible para:\n${prompt}\nDevuelve únicamente el código sin explicaciones.`,
    });
    res.json({
      success: true,
      html_code: response.text || "",
      framework
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Error al generar mockup" });
  }
});

// AI Image Generation Endpoint
app.post("/api/v1/ai/image", async (req: Request, res: Response) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ success: false, error: "El campo 'prompt' es requerido" });
  }

  res.json({
    success: true,
    message: "Generación de imagen solicitada para: " + prompt,
    image_url: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png"
  });
});

// ============================================================================
// Static Files & Web Navigation
// ============================================================================
const publicPath = path.join(process.cwd(), "public");

// Serve static assets (CSS, JS, icons)
app.use(express.static(publicPath));

// Route /admin and /backoffice to backoffice.html
app.get(["/admin", "/backoffice", "/backoffice.html"], (_req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "backoffice.html"));
});

// SPA fallback to index.html
app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Start Server
app.listen(PORT, HOST, () => {
  console.log(`Pokédex Server running at http://${HOST}:${PORT}`);
});
