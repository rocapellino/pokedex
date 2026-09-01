#!/usr/bin/env python3
# ==============================================================================
# Herramienta CLI de Google AI Studio (Gemini 2.0 & Imagen 3)
# ==============================================================================
import argparse
import base64
import sys
from pathlib import Path

# Añadir rutas para importar módulos locales
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / ".env")
except ImportError:
    pass

try:
    from src.ai_service import generate_flowchart, generate_image_asset, generate_ui_mockup
except ImportError:
    try:
        from apps.api.src.ai_service import generate_flowchart, generate_image_asset, generate_ui_mockup
    except ImportError as e:
        print(f"⚠️ Nota: Para usar las herramientas de IA localmente instala el SDK: pip install google-genai\nDetalle del error: {e}")
        sys.exit(1)



def handle_diagram(args):
    print(f"\n🧠 [Google AI Studio] Generando diagrama '{args.type}' con Gemini 2.0 Flash...")
    result = generate_flowchart(prompt=args.prompt, diagram_type=args.type)
    if not result.get("success"):
        print(f"❌ Error: {result.get('error')}")
        sys.exit(1)

    mermaid = result.get("mermaid_code")
    print("\n" + "=" * 60)
    print("📊 Código Mermaid Generado:")
    print("=" * 60)
    print(mermaid)
    print("=" * 60)

    if args.output:
        out_path = Path(args.output)
        out_path.write_text(mermaid, encoding="utf-8")
        print(f"💾 Guardado en: {out_path.resolve()}")


def handle_mock(args):
    print(f"\n🎨 [Google AI Studio] Generando UI Mockup ({args.framework}) con Gemini 2.0 Flash...")
    result = generate_ui_mockup(prompt=args.prompt, framework=args.framework)
    if not result.get("success"):
        print(f"❌ Error: {result.get('error')}")
        sys.exit(1)

    html = result.get("html_code")
    print("\n" + "=" * 60)
    print("🖥️ Mockup Frontend Generado:")
    print("=" * 60)
    print(html[:500] + ("..." if len(html) > 500 else ""))
    print("=" * 60)

    if args.output:
        out_path = Path(args.output)
        out_path.write_text(html, encoding="utf-8")
        print(f"💾 Guardado en: {out_path.resolve()}")


def handle_image(args):
    print("\n🖼️ [Google AI Studio] Generando imagen con Imagen 3...")
    result = generate_image_asset(prompt=args.prompt, aspect_ratio=args.aspect_ratio)
    if not result.get("success"):
        print(f"❌ Error: {result.get('error')}")
        sys.exit(1)

    b64_data = result.get("image_base64")
    out_path = Path(args.output or "generated_pokemon_art.png")
    out_path.write_bytes(base64.b64decode(b64_data))
    print("✅ ¡Imagen generada exitosamente!")
    print(f"💾 Guardada en: {out_path.resolve()}")


def main():
    parser = argparse.ArgumentParser(description="Pokédex AI Studio CLI - Generador con Gemini & Imagen 3")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcomando diagram
    p_diag = subparsers.add_parser("diagram", help="Generar diagrama Mermaid (flowchart, sequence, etc.)")
    p_diag.add_argument("prompt", type=str, help="Descripción del flujo o arquitectura")
    p_diag.add_argument("--type", type=str, default="flowchart", help="Tipo de diagrama (flowchart, sequence, classDiagram)")
    p_diag.add_argument("-o", "--output", type=str, help="Archivo donde guardar el código Mermaid")
    p_diag.set_defaults(func=handle_diagram)

    # Subcomando mock
    p_mock = subparsers.add_parser("mock", help="Generar mockup UI / componente frontend")
    p_mock.add_argument("prompt", type=str, help="Descripción de la interfaz o componente")
    p_mock.add_argument("--framework", type=str, default="html/css", help="Framework (html/css, tailwind, react)")
    p_mock.add_argument("-o", "--output", type=str, help="Archivo HTML donde guardar el mockup")
    p_mock.set_defaults(func=handle_mock)

    # Subcomando image
    p_img = subparsers.add_parser("image", help="Generar imagen digital con Imagen 3")
    p_img.add_argument("prompt", type=str, help="Descripción visual del Pokémon o asset")
    p_img.add_argument("--aspect-ratio", type=str, default="1:1", choices=["1:1", "16:9", "9:16", "4:3", "3:4"], help="Aspect ratio")
    p_img.add_argument("-o", "--output", type=str, default="pokemon_ai_art.png", help="Archivo PNG de salida")
    p_img.set_defaults(func=handle_image)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
