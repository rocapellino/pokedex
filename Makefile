.PHONY: help install dev test lint format audit security perf docker-up docker-down

help: ## Muestra la ayuda de comandos disponibles
	@echo "Comandos disponibles en Pokédex:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Instala dependencias de producción y desarrollo
	pip install -r requirements.txt
	pip install -r requirements-dev.txt

dev: ## Inicia el servidor de desarrollo FastAPI con hot-reload
	uvicorn apps.api.src.app:app --reload --host 0.0.0.0 --port 8000

test: ## Ejecuta pruebas unitarias con cobertura de código (pytest-cov)
	pytest -v --cov=apps/api/src --cov-report=term-missing

lint: ## Ejecuta análisis de calidad y linting con Ruff
	ruff check apps/ src/ scripts/

format: ## Aplica formateo automático con Ruff
	ruff format apps/ src/ scripts/

audit: ## Ejecuta auditoría completa (Ruff + Radon + Bandit + Duplicados)
	python scripts/audit_code_quality.py

security: ## Ejecuta análisis estático de seguridad SAST con Bandit
	bandit -r apps/api/src src/ -ll

perf: ## Ejecuta pruebas de carga y estrés con k6
	k6 run tests/performance/k6_stress_test.js

docker-up: ## Levanta el stack local con Docker Compose
	docker-compose up -d --build

docker-down: ## Detiene y elimina contenedores de Docker Compose
	docker-compose down
