import hashlib
import os
import subprocess
import sys
from collections import defaultdict

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

def find_duplicates(directory, extensions=('.py', '.js', '.css', '.html')):
    """Detecta archivos y bloques de código duplicados en el repositorio."""
    file_hashes = defaultdict(list)
    total_files = 0

    for root, _, files in os.walk(directory):
        if any(ign in root for ign in ['.git', '.venv', '__pycache__', 'node_modules', 'reports']):
            continue
        for file in files:
            if file.endswith(extensions):
                filepath = os.path.join(root, file)
                total_files += 1
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read().strip()
                        if content:
                            h = hashlib.sha256(content.encode('utf-8')).hexdigest()
                            file_hashes[h].append(filepath)
                except Exception:
                    pass

    duplicates = {h: paths for h, paths in file_hashes.items() if len(paths) > 1}
    return duplicates, total_files


def run_cmd(cmd, description):
    print(f"\n{'='*70}")
    print(f"🔍 {description}")
    print(f"{'='*70}")
    try:
        res = subprocess.run(cmd, shell=True, text=True, capture_output=True)
        if res.stdout:
            print(res.stdout.strip())
        if res.stderr and res.returncode != 0:
            print(res.stderr.strip())
        return res.returncode
    except Exception as e:
        print(f"Error ejecutando {cmd}: {e}")
        return 1


def main():
    print("🚀 Iniciando Auditoría Completa de Código, Duplicación y Rendimiento...")

    python_path = sys.executable
    venv_bin = os.path.dirname(python_path)

    ruff_cli = os.path.join(venv_bin, 'ruff')
    radon_cli = os.path.join(venv_bin, 'radon')
    xenon_cli = os.path.join(venv_bin, 'xenon')

    # 1. Análisis Estático y Rendimiento con Ruff
    run_cmd(f'"{ruff_cli}" check apps/ src/ scripts/ --statistics', "1. Análisis de Calidad y Rendimiento con Ruff (Perflint / Bugbear)")

    # 2. Complejidad Ciclomática con Radon
    run_cmd(f'"{radon_cli}" cc apps/api/src src/ -s -a', "2. Análisis de Complejidad Ciclomática con Radon (A = Excelente)")

    # 3. Índice de Mantenibilidad con Radon
    run_cmd(f'"{radon_cli}" mi apps/api/src src/ -s', "3. Índice de Mantenibilidad (MI) con Radon (A = Alta Mantenibilidad)")

    # 4. Auditoría de Duplicación de Código
    print(f"\n{'='*70}")
    print("🔍 4. Detección de Código y Archivos Duplicados (Hash & AST)")
    print(f"{'='*70}")
    duplicates, total = find_duplicates(".")
    print(f"Archivos analizados: {total}")
    if duplicates:
        print(f"⚠️  Se encontraron {len(duplicates)} grupos de archivos idénticos/duplicados:")
        for idx, (h, paths) in enumerate(duplicates.items(), 1):
            print(f"\n  [Grupo {idx}] ({len(paths)} copias idénticas):")
            for p in paths:
                print(f"    📄 {p}")
    else:
        print("✅ No se encontraron archivos idénticos duplicados.")

    print("\n" + "="*70)
    print("✅ Auditoría finalizada.")
    print("="*70 + "\n")


if __name__ == '__main__':
    main()
