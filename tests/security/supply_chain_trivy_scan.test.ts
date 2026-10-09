import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * Normaliza una referencia de imagen a su forma canónica `repository@sha256:...`.
 */
function canonicalImageRef(repository: string, tag: string, digest?: string): string {
  const found = digest?.match(/(sha256:[a-f0-9]{64})$/)?.[1] ?? tag.match(/@?(sha256:[a-f0-9]{64})$/)?.[1];
  return found ? `${repository}@${found}` : `${repository}:${tag}`;
}

/** Extrae `repository` + `tag` del bloque de una clave en values.yaml. */
function readDeployedImage(yaml: string, key: string): string | null {
  const start = yaml.indexOf(`\n${key}:`);
  if (start === -1) return null;
  const rest = yaml.slice(start + 1);
  const nextKey = rest.slice(1).search(/\n[a-z_]+:\s*$/m);
  const block = nextKey === -1 ? rest : rest.slice(0, nextKey + 1);

  const repository = block.match(/repository:\s*(\S+)/)?.[1];
  const rawTag = block.match(/tag:\s*"?([^"\n]+)"?/)?.[1];
  const digest = block.match(/digest:\s*"([^"\n]*)"/)?.[1];
  if (!repository || !rawTag) return null;
  return canonicalImageRef(repository, rawTag, digest);
}

/** Extrae las referencias del matrix `image:` del workflow de Trivy. */
function readScannedImages(workflow: string): string[] {
  const matrixBlock = workflow.slice(workflow.indexOf('matrix:'));
  const imageBlock = matrixBlock.slice(matrixBlock.indexOf('image:'));
  const end = imageBlock.indexOf('\n    steps:');
  const scoped = end === -1 ? imageBlock : imageBlock.slice(0, end);
  return [...scoped.matchAll(/-\s*'([^']+)'/g)].map((m) => m[1]);
}

test('🚨 WF-001: el scan de Trivy cubre exactamente las imágenes que el Chart despliega', () => {
  const values = fs.readFileSync(path.join(ROOT_DIR, 'infra/helm/pokedex/values.yaml'), 'utf-8');
  const workflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/security-trivy.yaml'), 'utf-8');

  // `backup` es la imagen de los CronJobs de backup y DR Verify (`backup.image`):
  // difiere de `postgresql.image` porque necesita el CLI openssl.
  const deployed = ['postgresql', 'redis', 'pgbouncer', 'backup']
    .map((k) => readDeployedImage(values, k))
    .filter((v): v is string => v !== null);

  assert.equal(deployed.length, 4, 'values.yaml debe declarar las 4 imágenes de infraestructura');

  const scanned = readScannedImages(workflow);
  assert.equal(scanned.length, 4, 'El matrix de Trivy debe escanear las 4 imágenes');

  for (const image of deployed) {
    assert.ok(
      scanned.includes(image),
      `El scan de Trivy debe incluir la imagen desplegada ${image}. Revisar el matrix de security-trivy.yaml.`,
    );
  }
  for (const image of scanned) {
    assert.ok(
      deployed.includes(image),
      `El scan de Trivy escanea ${image}, que NO es la imagen desplegada (falso positivo de seguridad).`,
    );
  }
});

test('🚨 WF-001: las imágenes escaneadas están fijadas por digest inmutable', () => {
  const workflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/security-trivy.yaml'), 'utf-8');
  const scanned = readScannedImages(workflow);

  assert.equal(scanned.length, 4);
  for (const image of scanned) {
    assert.match(
      image,
      /@sha256:[a-f0-9]{64}$/,
      `${image} debe fijarse por digest: una etiqueta móvil puede dejar de corresponder con lo desplegado`,
    );
  }
  assert.doesNotMatch(
    scanned.join('\n'),
    /edoburu/,
    'El repositorio despliega la imagen oficial pgbouncer/pgbouncer, no edoburu/pgbouncer',
  );
});
