#!/usr/bin/env python3
"""
Simulador de Carga Concurrente para Validación de Autoescalado (HPA) en Kubernetes
Genera tráfico masivo concurrente contra los endpoints web y API para elevar el uso de CPU/RAM
y verificar el escalado dinámico de réplicas en Kubernetes.
"""

import argparse
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


def send_request(url: str, request_id: int):
    start_time = time.time()
    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': f'HPA-LoadTester/1.0 (Req #{request_id})'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            status = response.getcode()
            duration = (time.time() - start_time) * 1000
            return (True, status, duration)
    except urllib.error.HTTPError as e:
        return (False, e.code, (time.time() - start_time) * 1000)
    except Exception as e:
        return (False, str(e), (time.time() - start_time) * 1000)

def main():
    parser = argparse.ArgumentParser(description="Prueba de carga concurrente para HPA en Kubernetes")
    parser.add_argument("--url", default="http://localhost:8080/api/pokemons", help="URL objetivo a estresar")
    parser.add_argument("--concurrency", type=int, default=50, help="Número de hilos concurrentes")
    parser.add_argument("--total-requests", type=int, default=3000, help="Total de peticiones a enviar")
    parser.add_argument("--duration", type=int, default=60, help="Duración máxima en segundos")
    args = parser.parse_args()

    if sys.stdout.encoding != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    print("=" * 70)
    print("[*] Iniciando Prueba de Carga para Autoescalado HPA en Kubernetes")
    print(f"[-] URL Objetivo:       {args.url}")
    print(f"[-] Concurrencia:       {args.concurrency} hilos simultáneos")
    print(f"[-] Peticiones totales: {args.total_requests}")
    print(f"[-] Duracion maxima:    {args.duration}s")
    print("=" * 70)
    print("[!] Tip: En otra terminal, ejecuta:")
    print("    kubectl get hpa -n pokemon-app -w")
    print("    kubectl get pods -n pokemon-app -w")
    print("=" * 70)

    success_count = 0
    fail_count = 0
    total_time = 0
    start_all = time.time()

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [
            executor.submit(send_request, args.url, i)
            for i in range(args.total_requests)
        ]

        completed = 0
        for future in as_completed(futures):
            success, code, duration = future.result()
            completed += 1
            if success and code == 200:
                success_count += 1
            else:
                fail_count += 1
            total_time += duration

            if completed % 250 == 0 or completed == args.total_requests:
                elapsed = time.time() - start_all
                rps = completed / elapsed if elapsed > 0 else 0
                print(f"[{elapsed:.1f}s] Progreso: {completed}/{args.total_requests} reqs | Exitosas: {success_count} | Fallidas: {fail_count} | RPS: {rps:.1f}")

            if time.time() - start_all > args.duration:
                print("[!] Tiempo limite alcanzado. Finalizando envio de carga...")
                break

    total_elapsed = time.time() - start_all
    avg_latency = (total_time / (success_count + fail_count)) if (success_count + fail_count) > 0 else 0
    throughput = (success_count + fail_count) / total_elapsed if total_elapsed > 0 else 0

    print("\n" + "=" * 70)
    print("[+] RESULTADOS DE LA PRUEBA DE CARGA")
    print(f"[OK] Total Peticiones Exitosas (200 OK): {success_count}")
    print(f"[ERR] Total Peticiones Fallidas:          {fail_count}")
    print(f"[TIME] Tiempo Total Transcurrido:          {total_elapsed:.2f}s")
    print(f"[PERF] Rendimiento Promedio:                {throughput:.1f} req/s")
    print(f"[LAT] Latencia Promedio:                   {avg_latency:.2f} ms")
    print("=" * 70)

if __name__ == '__main__':
    main()
