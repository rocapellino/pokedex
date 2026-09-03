# ==============================================================================
# Servicio de Inteligencia Artificial con Google AI Studio (Gemini & Imagen)
# ==============================================================================
import base64
import os
import re
from typing import Any, Dict, List, Optional

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None  # type: ignore
    types = None  # type: ignore

# Modelos recomendados con fallback automático ante picos de demanda
TEXT_MODELS: List[str] = [
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
]

IMAGE_MODELS: List[str] = [
    "imagen-3.0-generate-002",
    "gemini-2.5-flash-image",
    "gemini-3-pro-image",
]


def get_ai_client() -> Optional[Any]:
    """Obtiene el cliente de Google GenAI usando la variable de entorno GEMINI_API_KEY."""
    if genai is None:
        return None
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_google_ai_studio_api_key_here":
        return None
    return genai.Client(api_key=api_key)


def _generate_with_fallback(client: Any, prompt: str, system_instruction: str, temperature: float = 0.2) -> Dict[str, Any]:
    """Ejecuta generate_content intentando la lista de modelos en cascada."""
    last_error = ""
    for model_name in TEXT_MODELS:
        try:
            kwargs: Dict[str, Any] = {
                "model": model_name,
                "contents": prompt,
            }
            if types is not None:
                kwargs["config"] = types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=temperature,
                )
            response = client.models.generate_content(**kwargs)
            return {
                "success": True,
                "text": getattr(response, "text", "") or "",
                "model": model_name,
            }
        except Exception as e:
            last_error = str(e)
            continue

    return {
        "success": False,
        "error": f"Error invocando modelos de Google AI Studio: {last_error}",
        "text": "",
        "model": None,
    }


def generate_flowchart(prompt: str, diagram_type: str = "flowchart") -> Dict[str, Any]:
    """
    Genera código Mermaid válido para diagramas de flujo, arquitectura o secuencia
    utilizando Google AI Studio.
    """
    client = get_ai_client()
    if not client:
        return {
            "success": False,
            "error": "GEMINI_API_KEY no está configurada en las variables de entorno.",
            "mermaid_code": None,
        }

    system_instruction = (
        "Eres un arquitecto de software y DevOps experto en visualización de sistemas. "
        "Genera ÚNICAMENTE código Mermaid válido que represente con claridad el flujo, "
        "sin explicaciones adicionales ni texto introductorio. Usa siempre sintaxis moderna de Mermaid."
    )

    full_prompt = (
        f"Crea un diagrama de tipo {diagram_type} en formato Mermaid para el siguiente requerimiento:\n"
        f"{prompt}\n\n"
        f"Devuelve solo el bloque de código Mermaid."
    )

    res = _generate_with_fallback(client, full_prompt, system_instruction, temperature=0.2)
    if not res["success"]:
        return {
            "success": False,
            "error": res["error"],
            "mermaid_code": None,
        }

    content = res["text"]
    match = re.search(r"```(?:mermaid)?\s*([\s\S]*?)\s*```", content)
    clean_mermaid = match.group(1).strip() if match else content.strip()

    return {
        "success": True,
        "diagram_type": diagram_type,
        "mermaid_code": clean_mermaid,
        "model": res["model"],
    }


def generate_ui_mockup(prompt: str, framework: str = "html/css") -> Dict[str, Any]:
    """
    Genera un mockup / interfaz de usuario en HTML5/CSS3 o Tailwind
    utilizando Google AI Studio.
    """
    client = get_ai_client()
    if not client:
        return {
            "success": False,
            "error": "GEMINI_API_KEY no está configurada.",
            "html_code": None,
        }

    system_instruction = (
        "Eres un diseñador UI/UX y desarrollador Frontend senior especializado en interfaces "
        "modernas, temas oscuros, estética neón/glassmorphism y accesibilidad. "
        "Genera código HTML/CSS limpio, responsivo y visualmente impresionante."
    )

    full_prompt = (
        f"Genera un componente/mockup frontend usando {framework} para:\n{prompt}\n\n"
        f"Incluye estilos CSS embebidos o clases de Tailwind y diseño responsivo."
    )

    res = _generate_with_fallback(client, full_prompt, system_instruction, temperature=0.4)
    if not res["success"]:
        return {
            "success": False,
            "error": res["error"],
            "html_code": None,
        }

    content = res["text"]
    match = re.search(r"```(?:html|xml)?\s*([\s\S]*?)\s*```", content)
    clean_html = match.group(1).strip() if match else content.strip()

    return {
        "success": True,
        "framework": framework,
        "html_code": clean_html,
        "model": res["model"],
    }


def generate_image_asset(prompt: str, aspect_ratio: str = "1:1") -> Dict[str, Any]:
    """
    Genera una imagen digital / asset en alta calidad utilizando modelos de imagen
    de Google AI Studio.
    """
    client = get_ai_client()
    if not client:
        return {
            "success": False,
            "error": "GEMINI_API_KEY no está configurada.",
            "image_base64": None,
        }

    last_err = ""
    for model_name in IMAGE_MODELS:
        try:
            kwargs: Dict[str, Any] = {
                "model": model_name,
                "prompt": f"Pokémon inspired high quality art: {prompt}, 4k resolution, clean render",
            }
            if types is not None:
                kwargs["config"] = types.GenerateImagesConfig(
                    number_of_images=1,
                    output_mime_type="image/png",
                    aspect_ratio=aspect_ratio,
                )
            result = client.models.generate_images(**kwargs)

            if result.generated_images:
                image_bytes = result.generated_images[0].image.image_bytes
                encoded_b64 = base64.b64encode(image_bytes).decode("utf-8")
                return {
                    "success": True,
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio,
                    "image_base64": encoded_b64,
                    "model": model_name,
                }
        except Exception as e:
            last_err = str(e)
            continue

    return {
        "success": False,
        "error": f"No se pudo generar la imagen con los modelos disponibles: {last_err}",
        "image_base64": None,
    }
