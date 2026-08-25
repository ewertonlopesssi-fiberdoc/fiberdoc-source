/** Utilitários de baixo nível do Leaflet, compartilhados pelas telas de mapa. */
/** Remove um layer/marker do Leaflet com segurança (evita NotFoundError removeChild) */
export function safeLeafletRemove(layer: { remove: () => void } | null | undefined): void {
  if (!layer) return;
  try { layer.remove(); } catch (_e) { /* ignora erros de removeChild do DOM */ }
}
