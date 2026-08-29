import sys
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from test_get_all import run_test_get_all
from test_get_id import run_test_get_id
from test_post import run_test_post
from test_put import run_test_put
from test_delete import run_test_delete


def main():
    print("=== EJECUTANDO SECUENCIA COMPLETA DE PRUEBAS DE LA API DE POKEMON ===\n")

    print("--- 1. Obtener lista inicial de Pokemon ---")
    run_test_get_all()

    print("--- 2. Obtener Pokemon por ID (ID: 1 - Pikachu) ---")
    run_test_get_id(1)

    print("--- 3. Crear un nuevo Pokemon (Squirtle) ---")
    run_test_post()

    print("--- 4. Actualizar Pokemon (ID: 1 - Pikachu) ---")
    run_test_put(1)

    print("--- 5. Eliminar Pokemon (ID: 2 - Charmander) ---")
    run_test_delete(2)

    print("--- 6. Obtener lista final de Pokemon actualizada ---")
    run_test_get_all()

    print("=== SECUENCIA DE PRUEBAS FINALIZADA CON EXITO ===")


if __name__ == '__main__':
    main()
