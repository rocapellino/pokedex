import assert from 'node:assert/strict';

/** Etiqueta del nodo mermaid de `docs/README.md` que enlaza el índice de ADRs. */
export const ADR_INDEX_NODE_LABEL = 'Índice de ADRs (decisions/README.md)';

/**
 * Exige que el portal documental remita al índice `docs/decisions/README.md`
 * en lugar de citar un rango numérico de ADRs.
 *
 * Un rango ("ADR-001 a ADR-022") deriva cada vez que se agrega, consolida o
 * retira un ADR (AUD-GOV-DOC-002); la cobertura individual de cada ADR activo
 * la verifica el contrato del registro en `tests/security/adr_registry_contract.test.ts`.
 */
export function assertDocsPortalLinksAdrIndex(docsReadmeContent: string): void {
  assert.ok(
    docsReadmeContent.includes(ADR_INDEX_NODE_LABEL),
    `Mermaid en docs/README.md debe enlazar "${ADR_INDEX_NODE_LABEL}"`,
  );
  assert.doesNotMatch(
    docsReadmeContent,
    /ADR-\d{3} a ADR-\d{3}/,
    'docs/README.md no debe citar rangos numéricos de ADRs: derivan al consolidar o retirar ADRs',
  );
}
