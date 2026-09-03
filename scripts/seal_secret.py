#!/usr/bin/env python3
"""
Script Multiplataforma para Sellar Secretos con Bitnami Sealed Secrets.
Genera el secreto temporal en memoria y ejecuta kubeseal para producir infra/k8s/01-sealed-secrets.yaml.
"""

import argparse
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description="Sella secretos con Bitnami Sealed Secrets")
    parser.add_argument("--name", default="pokemon-secrets", help="Nombre del Secret de Kubernetes")
    parser.add_argument("--namespace", default="pokemon-app", help="Namespace de destino")
    parser.add_argument("--output", default="infra/k8s/01-sealed-secrets.yaml", help="Ruta del archivo de salida")
    args = parser.parse_args()

    kubeseal_bin = shutil.which("kubeseal") or shutil.which("kubeseal.exe")
    if not kubeseal_bin:
        # Verificar si existe en .tools
        from pathlib import Path
        local_tool = Path(__file__).resolve().parent.parent / ".tools" / ("kubeseal.exe" if sys.platform == "win32" else "kubeseal")
        if local_tool.exists():
            kubeseal_bin = str(local_tool)
        else:
            print("❌ Error: 'kubeseal' no encontrado en el PATH ni en .tools/.")
            print("   Descárgalo desde: https://github.com/bitnami-labs/sealed-secrets/releases")
            sys.exit(1)

    print("🔐 Generando Secret temporal y cifrando con Sealed Secrets...")

    secret_yaml = f"""apiVersion: v1
kind: Secret
metadata:
  name: {args.name}
  namespace: {args.namespace}
type: Opaque
stringData:
  POSTGRES_USER: "postgres"
  POSTGRES_PASSWORD: "postgres_secure_password_k8s"
  MINIO_ROOT_USER: "minioadmin"
  MINIO_ROOT_PASSWORD: "minioadmin_secure_password"
"""

    cmd = [
        kubeseal_bin,
        "--controller-namespace", "kube-system",
        "--controller-name", "sealed-secrets-controller",
        "--format", "yaml"
    ]

    try:
        proc = subprocess.run(cmd, input=secret_yaml, capture_output=True, text=True, check=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(proc.stdout)
        print(f"✅ Secreto sellado exitosamente guardado en: {args.output}")
        print("💡 Este archivo SealedSecret es seguro para versionar en Git (GitOps).")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error ejecutando kubeseal: {e.stderr}")
        sys.exit(e.returncode)


if __name__ == "__main__":
    main()
