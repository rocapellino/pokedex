# Mini Proyecto Python - Pokémon

### 👥 Integrantes - Grupo 3

- **Rodrigo Capellino**
- **Eric Arenas**

---

## 📁 Estructura del Proyecto

```text
tarea_grupal_1/
├── app.py                   # Punto de entrada principal
├── requirements.txt         # Dependencias del proyecto (Flask, pytest)
├── README.md                # Documentación del proyecto
├── src/                     # Código fuente de producción
│   ├── __init__.py
│   ├── app.py               # Lógica de la API y endpoints en Flask
│   ├── static/
│   │   └── css/
│   │       └── style.css    # Estilos CSS con diseño Glassmorphic Dark
│   └── templates/
│       └── index.html       # Dashboard web interactivo para la API
├── tests/                   # Pruebas unitarias automatizadas
│   └── test_app.py          # Pruebas con pytest
└── scripts/                 # Scripts individuales de prueba HTTP
    ├── test_get_all.py      # Prueba GET /pokemons
    ├── test_get_id.py       # Prueba GET /pokemons/<id>
    ├── test_post.py         # Prueba POST /pokemons
    ├── test_put.py          # Prueba PUT /pokemons/<id>
    ├── test_delete.py       # Prueba DELETE /pokemons/<id>
    └── run_all_scripts.py   # Orquestador que ejecuta todas las pruebas
```

---

## 📋 Requisitos Previos

- **Python 3.8+** instalado en el sistema.

---

## 🚀 Configuración e Instalación (usando Virtual Environment `venv`)

### 1. Acceder al directorio del proyecto

```bash
cd tarea_grupal_1
```

### 2. Crear el Entorno Virtual (`venv`)

**En Windows:**

```powershell
python -m venv .venv
```

**En Linux / macOS:**

```bash
python3 -m venv .venv
```

### 3. Activar el Entorno Virtual

**En Windows (PowerShell):**

```powershell
.\.venv\Scripts\Activate.ps1
```

**En Windows (CMD):**

```cmd
.\.venv\Scripts\activate.bat
```

**En Linux / macOS:**

```bash
source .venv/bin/activate
```

### 4. Instalar Dependencias

```bash
pip install -r requirements.txt
```

---

## 🏃 Ejecución de la API

Para iniciar el servidor Flask:

```bash
.venv/Scripts/python.exe app.py
```

La API estará corriendo por defecto en: `http://127.0.0.1:5000`

---

## 🧪 Pruebas Unitarias y Scripts de Prueba

**Ejecutar Scripts CRUD**

```bash
.venv/Scripts/python.exe ./scripts/test_get_all.py    # Probar GET /pokemons
.venv/Scripts/python.exe ./scripts/test_get_id.py     # Probar GET /pokemons/<id>
.venv/Scripts/python.exe ./scripts/test_post.py       # Probar POST /pokemons (Crear)
.venv/Scripts/python.exe ./scripts/test_put.py        # Probar PUT /pokemons/<id> (Actualizar)
.venv/Scripts/python.exe ./scripts/test_delete.py     # Probar DELETE /pokemons/<id> (Eliminar)
```

---

## 📖 Documentación de Rutas (API Endpoints)

### Estructura del Objeto Pokémon JSON

```json
{
  "id": 1,
  "nombre": "Pikachu",
  "imagen": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
  "caracteristicas": {
    "peso": 6.0,
    "altura": 0.4,
    "fuerza": 55,
    "edad": 5
  },
  "habilidades": ["Impactrueno", "Cola férrea"],
  "tipo": "Eléctrico",
  "habitat": "Bosques"
}
```

---

### Endpoints

1. **Ruta Raíz / Bienvenida:** `GET /`
2. **Listar todos los Pokémon:** `GET /pokemons`
3. **Obtener Pokémon por ID:** `GET /pokemons/<id>`
4. **Crear nuevo Pokémon:** `POST /pokemons`
5. **Actualizar Pokémon por ID:** `PUT /pokemons/<id>`
6. **Eliminar Pokémon por ID:** `DELETE /pokemons/<id>`
