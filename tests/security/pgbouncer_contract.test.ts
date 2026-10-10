/**
 * ==============================================================================
 * Contrato de PgBouncer: el chart, las NetworkPolicy y la imagen oficial deben coincidir
 * ==============================================================================
 *
 * PgBouncer solo se activa en el perfil de producción cloud (`values.prod.yaml`, ADR-011 y ADR-030), así que ningún
 * entorno activo lo ejecuta. Por eso nadie notó que el chart usaba las variables de otra imagen (`DB_*`), que las
 * NetworkPolicy apuntaban al puerto 5432 en lugar del 6432 y a una etiqueta que el pod no tenía, y que el
 * entrypoint no podía escribir su configuración con el sistema de archivos de solo lectura. Este contrato cierra
 * esas brechas sobre el render del perfil que sí lo activa.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type K8sDoc, PROFILES, podSpecOf, renderChart } from '../helpers/helm-render.js';
import { readYaml } from '../helpers/yaml.js';

const COMPONENT = 'app.kubernetes.io/component';

function pgbouncer() {
  const docs = renderChart(PROFILES.prod);
  const deployment = docs.find((d) => d.kind === 'Deployment' && d.metadata.name === 'pgbouncer');
  assert.ok(deployment, 'el perfil prod debe renderizar Deployment/pgbouncer');
  const spec = podSpecOf(deployment);
  const container = spec.containers.find((c: any) => c.name === 'pgbouncer');
  assert.ok(container, 'el pod debe tener el contenedor pgbouncer');
  const port: number = container.ports[0].containerPort;
  const env = Object.fromEntries((container.env ?? []).map((e: any) => [e.name, e]));
  return { docs, deployment, spec, container, port, env };
}

const selectsPgbouncer = (selector: any) => selector?.matchLabels?.[COMPONENT] === 'pgbouncer';

test('🔌 PgBouncer: el contenedor solo usa variables de la imagen oficial (DATABASES_* y PGBOUNCER_*)', () => {
  const { container, env } = pgbouncer();

  for (const name of Object.keys(env)) {
    assert.match(
      name,
      /^(DATABASES|PGBOUNCER)_[A-Z_]+$/,
      `${name}: la imagen pgbouncer/pgbouncer solo lee DATABASES_* y PGBOUNCER_* (las DB_* son de otra imagen)`,
    );
  }
  assert.ok(env.DATABASES_HOST, 'sin DATABASES_HOST el entrypoint termina con error');
  assert.equal(container.ports[0].containerPort, 6432);
  assert.equal(
    env.PGBOUNCER_LISTEN_PORT?.value,
    String(container.ports[0].containerPort),
    'puerto de escucha explícito',
  );
});

test('🔐 PgBouncer: los clientes se autentican con scram-sha-256 y la contraseña no entra en pgbouncer.ini', () => {
  const { spec, container, env } = pgbouncer();

  assert.equal(env.PGBOUNCER_AUTH_TYPE?.value, 'scram-sha-256', 'auth_type any/trust aceptaría cualquier credencial');
  const authFile: string = env.PGBOUNCER_AUTH_FILE?.value;
  assert.ok(authFile, 'PGBOUNCER_AUTH_FILE debe apuntar al userlist');
  assert.equal(env.DATABASES_PASSWORD, undefined, 'la contraseña del servidor sale del userlist, no del .ini');
  assert.ok(env.PGBOUNCER_ADMIN_USERS?.value, 'admin_users no debe quedar en el valor por defecto (postgres)');
  assert.notEqual(env.PGBOUNCER_ADMIN_USERS.value, 'postgres');

  // El userlist lo genera un initContainer en un emptyDir en memoria que el contenedor principal monta en solo lectura.
  const init = (spec.initContainers ?? []).find((c: any) => c.name === 'render-userlist');
  assert.ok(init, 'debe existir el initContainer render-userlist');
  assert.equal(init.securityContext?.readOnlyRootFilesystem, true);
  assert.equal(init.securityContext?.allowPrivilegeEscalation, false);
  assert.deepEqual(init.securityContext?.capabilities?.drop, ['ALL']);
  assert.ok(
    init.resources?.limits?.memory && init.resources?.requests?.cpu,
    'el initContainer necesita límites (ResourceQuota)',
  );

  const mountPath = authFile.slice(0, authFile.lastIndexOf('/'));
  const initMount = init.volumeMounts.find((m: any) => m.mountPath === mountPath);
  const mainMount = container.volumeMounts.find((m: any) => m.mountPath === mountPath);
  assert.ok(initMount && mainMount, `${mountPath} debe montarse en ambos contenedores`);
  assert.equal(mainMount.name, initMount.name, 'ambos comparten el mismo volumen');
  assert.equal(mainMount.readOnly, true, 'el contenedor principal solo lee el userlist');
  const volume = spec.volumes.find((v: any) => v.name === mainMount.name);
  assert.equal(volume?.emptyDir?.medium, 'Memory', 'el userlist con la contraseña no debe tocar disco');
});

test('🧱 PgBouncer: el entrypoint puede escribir su configuración con el sistema de archivos de solo lectura', () => {
  const { container, spec } = pgbouncer();

  assert.equal(container.securityContext?.readOnlyRootFilesystem, true);
  for (const path of ['/tmp', '/etc/pgbouncer']) {
    const mount = container.volumeMounts.find((m: any) => m.mountPath === path);
    assert.ok(mount, `${path} debe estar montado`);
    assert.notEqual(mount.readOnly, true, `${path} debe ser escribible`);
    assert.ok(spec.volumes.find((v: any) => v.name === mount.name)?.emptyDir, `${path} debe ser un emptyDir`);
  }
});

test('🏷️ PgBouncer: el pod lleva la etiqueta de componente que seleccionan las políticas de red', () => {
  const { deployment } = pgbouncer();
  const labels = deployment.spec.template.metadata.labels;
  assert.equal(labels[COMPONENT], 'pgbouncer');
  for (const [key, value] of Object.entries(deployment.spec.selector.matchLabels)) {
    assert.equal(labels[key], value, `la etiqueta ${key} del selector debe estar en el pod`);
  }
});

test('🌐 PgBouncer: Service, ConfigMap y políticas de red usan el puerto en el que escucha', () => {
  const { docs, port } = pgbouncer();

  const service = docs.find((d) => d.kind === 'Service' && d.metadata.name === 'pgbouncer-service');
  assert.ok(service, 'Service/pgbouncer-service');
  assert.equal(service.spec.ports[0].port, port);
  assert.equal(service.spec.ports[0].targetPort, port);

  const config = docs.find((d) => d.kind === 'ConfigMap' && d.metadata.name === 'pokemon-config');
  assert.equal(config?.data?.POSTGRES_HOST, 'pgbouncer-service');
  assert.equal(config?.data?.POSTGRES_PORT, String(port), 'la API debe conectar al puerto de PgBouncer');

  const portsOf = (rules: any[]) => rules.flatMap((r) => (r.ports ?? []).map((p: any) => p.port));
  let checked = 0;

  for (const doc of docs as K8sDoc[]) {
    if (doc.kind === 'NetworkPolicy') {
      // Tráfico saliente hacia PgBouncer (p. ej. desde la API).
      for (const rule of doc.spec.egress ?? []) {
        if ((rule.to ?? []).some((t: any) => selectsPgbouncer(t.podSelector))) {
          assert.deepEqual(portsOf([rule]), [port], `${doc.metadata.name}: egress hacia PgBouncer`);
          checked++;
        }
      }
      // Tráfico entrante a PgBouncer.
      if (selectsPgbouncer(doc.spec.podSelector)) {
        for (const rule of doc.spec.ingress ?? []) {
          assert.deepEqual(portsOf([rule]), [port], `${doc.metadata.name}: ingress a PgBouncer`);
          checked++;
        }
      }
    }
    if (doc.kind === 'CiliumNetworkPolicy') {
      for (const rule of doc.spec.egress ?? []) {
        if ((rule.toEndpoints ?? []).some((e: any) => selectsPgbouncer(e))) {
          const ports = (rule.toPorts ?? []).flatMap((t: any) => t.ports.map((p: any) => Number(p.port)));
          assert.deepEqual(ports, [port], `${doc.metadata.name}: egress L3/L4 hacia PgBouncer`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked >= 3, `se esperaban al menos 3 reglas hacia/desde PgBouncer; verificadas: ${checked}`);
});

test('☸️ PgBouncer: el job de Kind lo habilita y valida la ruta API → PgBouncer → PostgreSQL y su autenticación', () => {
  const steps = readYaml<{ jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }> }>(
    '.github/workflows/infra.yaml',
  ).jobs['kind-integration'].steps;
  const script = steps.map((step) => step.run ?? '').join('\n');

  assert.match(script, /--set pgbouncer\.enabled=true/, 'el job debe habilitar PgBouncer sobre el release');
  assert.match(script, /POSTGRES_HOST/, 'debe comprobar que la API apunta a pgbouncer-service');
  assert.match(script, /\/readyz/, 'debe comprobar que la API llega a PostgreSQL a través de PgBouncer');
  assert.match(script, /login attempt/, 'debe comprobar que PgBouncer registra la conexión de la API');
  for (const rejected of ['authentication failed', 'no such database', 'not allowed']) {
    assert.ok(script.includes(rejected), `debe verificar el rechazo «${rejected}»`);
  }
});
