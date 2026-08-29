# Mini Proyecto Python - Pokémon API 🚀

API RESTful desarrollada en **Python (Flask)** para gestión del catálogo de Pokémon, con pruebas automatizadas, dashboard web interactivo y contenerización lista para producción bajo estándares **DevOps**.

### 👥 Integrantes - Grupo 3

- **Rodrigo Capellino**
- **Eric Arenas**

---

## 📁 Estructura del Proyecto

```text
tarea_grupal_1/
├── .github/
│   ├── workflows/
│   │   └── ci.yml                   # Pipeline de CI/CD (Tests + Docker Build)
│   └── pull_request_template.md     # Plantilla estándar para Pull Requests
├── src/                             # Código fuente de producción
│   ├── __init__.py
│   ├── app.py                       # Lógica de la API REST y endpoints en Flask
│   ├── static/
│   │   └── css/
│   │       └── style.css            # Estilos CSS con diseño Glassmorphic Dark
│   └── templates/
│       └── index.html               # Dashboard web interactivo para la API
├── tests/                           # Pruebas unitarias automatizadas
│   └── test_app.py                  # Pruebas con pytest
├── scripts/                         # Scripts individuales de prueba HTTP
│   ├── test_get_all.py              # Prueba GET /pokemons
│   ├── test_get_id.py               # Prueba GET /pokemons/<id>
│   ├── test_post.py                 # Prueba POST /pokemons
│   ├── test_put.py                  # Prueba PUT /pokemons/<id>
│   ├── test_delete.py               # Prueba DELETE /pokemons/<id>
│   └── run_all_scripts.py           # Orquestador de pruebas HTTP
├── .dockerignore                    # Exclusiones de contexto para Docker
├── .env.example                     # Plantilla de variables de entorno
├── .gitignore                       # Exclusiones de control de versiones Git
├── .pre-commit-config.yaml          # Configuración de Git Hooks
├── Dockerfile                       # Construcción multi-stage de imagen Docker
├── MEJORES_PRACTICAS_DOCKERFILE.md  # Guía de estándares para Docker
├── MEJORES_PRACTICAS_GIT.md         # Guía de estándares para Git y flujo de trabajo
├── README.md                        # Documentación principal
├── app.py                           # Punto de entrada para desarrollo local
└── requirements.txt                 # Dependencias (Flask, pytest, gunicorn)
```

---

## 📚 Guías de Mejores Prácticas Incluidas

- 🐳 [**Guía de Mejores Prácticas para Dockerfile**](./MEJORES_PRACTICAS_DOCKERFILE.md): Arquitectura multi-stage, usuarios no-root, caché de capas, healthchecks y optimización de seguridad.
- 🌿 [**Guía de Mejores Prácticas para Git**](./MEJORES_PRACTICAS_GIT.md): Conventional Commits, GitHub Flow, protección de ramas, plantillas de PR y versionado semántico (SemVer).

---

## 📋 Requisitos Previos

- **Python 3.8+** (para ejecución local en entorno virtual)
- **Docker Desktop** (para ejecución contenerizada)

---

## 🐳 Ejecución con Docker (Recomendado para Producción)

### 1. Construir la Imagen Docker

```bash
docker build -t pokemon-api:1.0.0 -t pokemon-api:latest .
```

### 2. Ejecutar el Contenedor

```bash
docker run -d \
  --name pokemon-app \
  -p 5000:5000 \
  --restart unless-stopped \
  pokemon-api:latest
```

### 3. Verificar Estado y Logs

```bash
# Ver estado del contenedor y Healthcheck
docker ps

# Ver logs de la aplicación
docker logs -f pokemon-app

# Detener y eliminar el contenedor
docker stop pokemon-app && docker rm pokemon-app
```

---

## 🚀 Ejecución Local con Virtual Environment (`venv`)

### 1. Crear el Entorno Virtual

**En Windows:**
```powershell
python -m venv .venv
```

**En Linux / macOS:**
```bash
python3 -m venv .venv
```

### 2. Activar el Entorno Virtual

**En Windows (PowerShell):**
```powershell
.\.venv\Scripts\Activate.ps1
```

**En Linux / macOS:**
```bash
source .venv/bin/activate
```

### 3. Instalar Dependencias

```bash
pip install -r requirements.txt
```

### 4. Iniciar el Servidor

```bash
python app.py
```

Acceder en el navegador a: `http://127.0.0.1:5000` o `http://127.0.0.1:5000/gui`

---

## 🧪 Pruebas Automatizadas

### Ejecutar Pruebas Unitarias con Pytest

```bash
pytest -v tests/
```

### Ejecutar Scripts de Prueba HTTP CRUD

```bash
python scripts/run_all_scripts.py
```

---

## 📖 Documentación de la API (Endpoints)

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/` | Bienvenida (JSON) o Dashboard Web (Navegador) |
| `GET` | `/gui` | Interfaz Web Gráfica |
| `GET` | `/pokemons` | Lista todos los Pokémon |
| `GET` | `/pokemons/<id>` | Obtiene un Pokémon por ID |
| `POST` | `/pokemons` | Crea un nuevo Pokémon |
| `PUT` | `/pokemons/<id>` | Actualiza un Pokémon existente |
| `DELETE` | `/pokemons/<id>` | Elimina un Pokémon por ID |
