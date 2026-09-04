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
                stage('TypeScript Linting') {
                    steps {
                        echo '=== Ejecutando verificación de tipos con TypeScript ==='
                        sh '''
                            npm ci
                            npm run lint
                        '''
                    }
                }
                stage('Security Audit (npm audit & Gitleaks)') {
                    steps {
                        echo '=== Auditoría de vulnerabilidades y detección de secretos ==='
                        sh '''
                            npm audit --audit-level=high || true
                            if command -v gitleaks >/dev/null 2>&1; then
                                gitleaks detect --verbose --no-git
                            fi
                        '''
                    }
                }
            }
        }

        stage('3. Compilación & Build de Producción') {
            steps {
                echo '=== Compilando bundle de servidor con esbuild ==='
                sh '''
                    npm run build
                '''
            }
        }

        stage('4. Construcción de Contenedores Docker') {
            steps {
                echo '=== Construyendo imágenes de producción con Docker ==='
                sh '''
                    docker build -t ${DOCKER_REGISTRY}/pokedex-api:${IMAGE_TAG} -t ${DOCKER_REGISTRY}/pokedex-api:latest -f Dockerfile .
                    docker build -t ${DOCKER_REGISTRY}/pokedex-web:${IMAGE_TAG} -t ${DOCKER_REGISTRY}/pokedex-web:latest -f apps/web/Dockerfile .
                '''
            }
        }

        stage('5. Despliegue en Staging (Kubernetes con Helm)') {
            when {
                branch 'develop'
            }
            steps {
                echo '=== Desplegando en clúster Kubernetes con Helm (Namespace: pokemon-app) ==='
                sh '''
                    helm upgrade --install pokedex ./infra/helm/pokedex --namespace pokemon-app --create-namespace --set api.image.tag=${IMAGE_TAG} --set web.image.tag=${IMAGE_TAG}
                    kubectl rollout status deployment/pokedex-api -n pokemon-app --timeout=90s
                    kubectl rollout status deployment/pokedex-web -n pokemon-app --timeout=90s
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

        stage('7. Despliegue en Producción (Kubernetes con Helm)') {
            when {
                branch 'main'
            }
            steps {
                echo '=== Desplegando en Producción con Helm (values.prod.yaml) ==='
                sh '''
                    helm upgrade --install pokedex ./infra/helm/pokedex --namespace pokemon-app --create-namespace -f ./infra/helm/pokedex/values.prod.yaml --set api.image.tag=${IMAGE_TAG} --set web.image.tag=${IMAGE_TAG}
                    kubectl rollout status deployment/pokedex-api -n pokemon-app --timeout=120s
                    kubectl rollout status deployment/pokedex-web -n pokemon-app --timeout=120s
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
