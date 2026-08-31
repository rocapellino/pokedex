pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = 'docker.io/mi-organizacion'
        APP_NAME = 'pokedex'
        IMAGE_TAG = "${env.BUILD_NUMBER}"
        PYTHONUNBUFFERED = '1'
    }

    options {
        timeout(time: 20, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        ansiColor('xterm')
    }

    stages {
        stage('1. Checkout & Validación de Entorno') {
            steps {
                echo '=== Descargando código del repositorio ==='
                checkout scm
                sh 'git log -1 --oneline'
            }
        }

        stage('2. Análisis de Código & Seguridad') {
            parallel {
                stage('Linting (Ruff & Flake8)') {
                    steps {
                        echo '=== Ejecutando análisis estático ==='
                        sh '''
                            python3 -m venv .venv
                            . .venv/bin/activate
                            pip install --quiet ruff flake8
                            ruff check apps/api/src/ || true
                            flake8 apps/api/src/ --max-line-length=120 --count --statistics || true
                        '''
                    }
                }
                stage('Secret Scanning (Gitleaks)') {
                    steps {
                        echo '=== Escaneo de credenciales con Gitleaks ==='
                        sh '''
                            if command -v gitleaks >/dev/null 2>&1; then
                                gitleaks detect --verbose --no-git || true
                            else
                                echo "Gitleaks no instalado en el agente, omitiendo escaneo"
                            fi
                        '''
                    }
                }
            }
        }

        stage('3. Pruebas Unitarias & Cobertura') {
            steps {
                echo '=== Ejecutando pruebas unitarias con Pytest ==='
                sh '''
                    python3 -m venv .venv
                    . .venv/bin/activate
                    pip install --quiet -r requirements.txt -r requirements-dev.txt
                    mkdir -p reports
                    pytest --verbose --junitxml=reports/test-results.xml
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/test-results.xml'
                }
            }
        }

        stage('4. Construcción de Contenedores Docker') {
            steps {
                echo '=== Construyendo imágenes de producción con Docker ==='
                sh '''
                    docker build -t ${DOCKER_REGISTRY}/pokedex-api:${IMAGE_TAG} -t ${DOCKER_REGISTRY}/pokedex-api:latest -f apps/api/Dockerfile .
                    docker build -t ${DOCKER_REGISTRY}/pokedex-web:${IMAGE_TAG} -t ${DOCKER_REGISTRY}/pokedex-web:latest -f apps/web/Dockerfile .
                '''
            }
        }

        stage('5. Despliegue en Staging (Kubernetes)') {
            when {
                branch 'develop'
            }
            steps {
                echo '=== Desplegando en clúster Kubernetes (Namespace: staging) ==='
                sh '''
                    kubectl apply -k infra/k8s/
                    kubectl rollout status deployment/pokedex-api -n default --timeout=60s
                    kubectl rollout status deployment/pokedex-web -n default --timeout=60s
                '''
            }
        }

        stage('6. Aprobación Manual para Producción') {
            when {
                branch 'main'
            }
            steps {
                input message: '¿Aprobar despliegue a PRODUCCIÓN?', ok: 'Desplegar a Producción'
            }
        }

        stage('7. Despliegue en Producción (Kubernetes)') {
            when {
                branch 'main'
            }
            steps {
                echo '=== Desplegando en Producción con Kubernetes ==='
                sh '''
                    kubectl set image deployment/pokedex-api api=${DOCKER_REGISTRY}/pokedex-api:${IMAGE_TAG} --record
                    kubectl set image deployment/pokedex-web web=${DOCKER_REGISTRY}/pokedex-web:${IMAGE_TAG} --record
                    kubectl rollout status deployment/pokedex-api --timeout=120s
                    kubectl rollout status deployment/pokedex-web --timeout=120s
                '''
            }
        }
    }

    post {
        success {
            echo "✅ Pipeline completado exitosamente para el commit ${env.GIT_COMMIT}"
        }
        failure {
            echo "❌ Pipeline falló. Revisa los logs de la consola."
        }
        always {
            cleanWs deleteDirs: true, notFailBuild: true
        }
    }
}
