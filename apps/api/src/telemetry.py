# ==============================================================================
# OpenTelemetry Distributed Tracing & APM Setup (FastAPI + Tempo)
# ==============================================================================
import logging
import os

logger = logging.getLogger(__name__)

_IS_TRACING_ENABLED = False


def setup_telemetry(app, service_name: str = "pokedex-api") -> bool:
    """
    Configura e inicializa la instrumentación de OpenTelemetry (OTel) para FastAPI.
    Si las dependencias no están instaladas o no se especifica un endpoint OTLP,
    la aplicación continúa operando con normalidad sin trazas distribuidas.
    """
    global _IS_TRACING_ENABLED

    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not otlp_endpoint:
        logger.info("[Telemetry] OTEL_EXPORTER_OTLP_ENDPOINT no configurado. Trazas distribuidas deshabilitadas.")
        return False

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create(
            attributes={
                "service.name": service_name,
                "service.version": "1.0.0",
                "deployment.environment": os.getenv("ENVIRONMENT", "development"),
            }
        )

        provider = TracerProvider(resource=resource)

        # Endpoint gRPC para Tempo (ej. http://tempo:4317)
        insecure = not otlp_endpoint.startswith("https://")
        clean_endpoint = otlp_endpoint.replace("http://", "").replace("https://", "")

        exporter = OTLPSpanExporter(
            endpoint=clean_endpoint,
            insecure=insecure
        )

        processor = BatchSpanProcessor(exporter)
        provider.add_span_processor(processor)
        trace.set_tracer_provider(provider)

        # Instrumentación automática de FastAPI
        FastAPIInstrumentor.instrument_app(
            app,
            tracer_provider=provider,
            excluded_urls="healthz,readyz,metrics"
        )

        _IS_TRACING_ENABLED = True
        logger.info("[Telemetry] OpenTelemetry instrumentado exitosamente hacia: %s", otlp_endpoint)
        return True

    except ImportError as e:
        logger.warning("[Telemetry] Dependencias de OpenTelemetry no instaladas (%s). Saltando instrumentación.", e)
        return False
    except Exception as e:
        logger.error("[Telemetry] Error al inicializar OpenTelemetry: %s", e)
        return False


def is_tracing_enabled() -> bool:
    """Indica si el sistema de trazabilidad distribuida está activo."""
    return _IS_TRACING_ENABLED
