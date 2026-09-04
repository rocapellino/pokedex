pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = 'docker.io/mi-organizacion'
        APP_NAME = 'pokedex'
        IMAGE_TAG = "${env.BUILD_NUMBER}"
        PYTHONUNBUFFERED = '1'
        TESTING = 'true'
        ADMIN_API_KEY = 'jenkins-ci-test-admin-key'
        AI_API_KEY = 'jenkins-ci-test-ai-key'
    }

    options {
        timeout(time: 20, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        ansiColor('xterm')
    }

    stages {
        stage('1. Información de Commit & Entorno') {
            steps {
                echo '=== Código descargado del repositorio ==='
                sh 'git log -1 --oneline'
            }
        }

        stage('2. Análisis de Código & Seguridad (SAST)') {
            parallel {
                stage('Linting (Ruff)') {
                    steps {
                        echo '=== Ejecutando análisis estático con Ruff ==='
                        sh '''
                            python3 -m venv .venv
                            . .venv/bin/activate
                            pip install --quiet ruff
                            ruff check apps/api/src/ apps/api/tests/
                        '''
                    }
                }
                stage('Security Audit (Bandit & Gitleaks)') {
                    steps {
                        echo '=== Escaneo SAST con Bandit y detección de secretos ==='
                        sh '''
                            python3 -m venv .venv
                            . .venv/bin/activate
                            pip install --quiet bandit
                            bandit -r apps/api/src/ -ll -q
                            if command -v gitleaks >/dev/null 2>&1; then
                                gitleaks detect --verbose --no-git
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
                    pip install --quiet -r requirements.txt -r apps/api/requirements.txt
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
                echo '=== Desplegando en clúster Kubernetes (Namespace: pokemon-app) ==='
                sh '''
                    kubectl apply -k infra/k8s/
                    kubectl rollout status deployment/pokemon-api -n pokemon-app --timeout=90s
                    kubectl rollout status deployment/pokemon-web -n pokemon-app --timeout=90s
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
                    kubectl set image deployment/pokemon-api pokemon-api=${DOCKER_REGISTRY}/pokedex-api:${IMAGE_TAG} -n pokemon-app
                    kubectl set image deployment/pokemon-web pokemon-web=${DOCKER_REGISTRY}/pokedex-web:${IMAGE_TAG} -n pokemon-app
                    kubectl rollout status deployment/pokemon-api -n pokemon-app --timeout=120s
                    kubectl rollout status deployment/pokemon-web -n pokemon-app --timeout=120s
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
    }
}
