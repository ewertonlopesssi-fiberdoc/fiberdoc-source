import { unzipSync, strFromU8 } from "fflate";

/**
 * Leitura de arquivos KML/KMZ exportados por Google Earth e similares.
 *
 * Extraído de InfrastructureMap.tsx sem alteração de lógica. O objetivo aqui
 * não é só encolher aquele arquivo: parsing de KML é o tipo de coisa que
 * quebra em silêncio quando o formato de origem muda um detalhe, e como
 * função isolada isto passa a ser testável — dentro do componente não era.
 *
 * A classificação de tipo é heurística, baseada em nome da pasta, nome do
 * elemento, descrição e ícone. Foi calibrada com exportações reais e é o
 * ponto mais provável de precisar de ajuste ao encontrar um KML diferente.
 */
export type KmlPreviewItem = {
  id: string;
  name: string;
  type: "cto" | "ceo" | "cabo" | "poste" | "reserva" | "poi";
  color: string | null;
  lat: number | null;
  lng: number | null;
  path: string | null;
  fiberName: string | null;
  include: boolean;
  folderName: string;
  fiberCount: number;
  cableType: string;
  capacity: number;
  sizeMeters: number;
  iconHref: string;     // URL do ícone original do KML
  selected: boolean;    // selecionado para edição em lote
  poiCategory: string;  // categoria do POI
};

/**
 * Lê um arquivo .kml ou .kmz e devolve os elementos reconhecidos.
 * Devolve lista vazia quando nada é reconhecido — quem chama decide o que
 * fazer com isso.
 */
export async function parseKmlFile(file: File): Promise<KmlPreviewItem[]> {
  let kmlText: string;
  if (file.name.toLowerCase().endsWith(".kmz")) {
    const buf = await file.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buf));
    // Procurar o primeiro ficheiro .kml dentro do ZIP (comprimido ou não)
    const kmlEntry = Object.keys(unzipped).find(name => name.toLowerCase().endsWith(".kml"));
    if (!kmlEntry) throw new Error("Nenhum ficheiro .kml encontrado dentro do KMZ");
    kmlText = strFromU8(unzipped[kmlEntry]);
  } else {
    kmlText = await file.text();
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText!, "application/xml");
  const styleIconMap: Record<string, string> = {};
  const styleColorMap: Record<string, string> = {};
  // Indexar todos os <Style id="..."> com href do ícone e cor da linha
  doc.querySelectorAll("Style").forEach(style => {
    const id = style.getAttribute("id");
    if (!id) return;
    const href = style.querySelector("IconStyle > Icon > href")?.textContent ?? "";
    styleIconMap["#" + id] = href; // preservar case original
    const kmlColor = style.querySelector("LineStyle > color")?.textContent?.trim();
    if (kmlColor && kmlColor.length === 8) {
      const rr = kmlColor.slice(6, 8); const gg = kmlColor.slice(4, 6); const bb = kmlColor.slice(2, 4);
      styleColorMap["#" + id] = `#${rr}${gg}${bb}`;
    }
  });
  // Indexar <StyleMap id="..."> → resolver para o par normalStyle (key=normal)
  const styleMapMap: Record<string, string> = {};
  doc.querySelectorAll("StyleMap").forEach(sm => {
    const id = sm.getAttribute("id");
    if (!id) return;
    // Preferir o Pair com key=normal; fallback para o primeiro
    let resolvedUrl = "";
    sm.querySelectorAll("Pair").forEach(pair => {
      const key = pair.querySelector("key")?.textContent?.trim();
      const url = pair.querySelector("styleUrl")?.textContent?.trim() ?? "";
      if (key === "normal" || resolvedUrl === "") resolvedUrl = url;
    });
    styleMapMap["#" + id] = resolvedUrl;
  });
  // Função para resolver styleUrl → iconHref (suporta StyleMap e Style directo)
  const resolveIconHref = (styleUrl: string, pmElement: Element): string => {
    if (!styleUrl) {
      // Tentar estilo inline no próprio Placemark
      return pmElement.querySelector("IconStyle > Icon > href")?.textContent?.trim() ?? "";
    }
    // Se aponta para um StyleMap, resolver para o Style normal
    let resolved = styleUrl;
    if (styleMapMap[styleUrl]) resolved = styleMapMap[styleUrl];
    return styleIconMap[resolved] ?? pmElement.querySelector("IconStyle > Icon > href")?.textContent?.trim() ?? "";
  };
  // Função para resolver cor da linha
  const resolveLineColor = (styleUrl: string, pmElement: Element): string | null => {
    let resolved = styleUrl;
    if (styleMapMap[styleUrl]) resolved = styleMapMap[styleUrl];
    const inlineColor = pmElement.querySelector("LineStyle > color")?.textContent?.trim();
    if (inlineColor && inlineColor.length === 8) {
      const rr = inlineColor.slice(6, 8); const gg = inlineColor.slice(4, 6); const bb = inlineColor.slice(2, 4);
      return `#${rr}${gg}${bb}`;
    }
    return styleColorMap[resolved] ?? null;
  };

  const extractFiberName = (rawName: string, desc: string): string => {
    const pattern = /^(.+?)\s+(?:para|sentido|sent)\s+/i;
    const namePara = rawName.match(pattern);
    if (namePara) return namePara[1].trim();
    const descPara = desc.match(pattern);
    if (descPara) return descPara[1].trim();
    return rawName;
  };
  const detectType = (pm: Element, folderName: string): "cto" | "ceo" | "cabo" | "poste" | "reserva" | "poi" => {
    const name = pm.querySelector("name")?.textContent?.trim().toLowerCase() ?? "";
    const desc = pm.querySelector("description")?.textContent?.toLowerCase() ?? "";
    const styleUrl = pm.querySelector("styleUrl")?.textContent?.trim() ?? "";
    const iconHref = resolveIconHref(styleUrl, pm).toLowerCase();
    const folderLower = folderName.toLowerCase();
    const hasLine = !!pm.querySelector("LineString");
    if (hasLine) return "cabo";
    // Poste
    if (folderLower.includes("poste") || name.includes("poste") || iconHref.includes("pole")) return "poste";
    // Reserva Técnica
    if (folderLower.includes("reserva") || name.includes("reserva") || iconHref.includes("reserve")) return "reserva";
    // CTO
    if (folderLower.includes("cto") || folderLower.includes("splitter")) return "cto";
    if (iconHref.includes("square") || iconHref.includes("cto")) return "cto";
    if (name.includes("cto") || desc.includes("cto") || name.startsWith("sp ")) return "cto";
    // CEO
    if (folderLower.includes("ceo") || folderLower.includes("caixa")) return "ceo";
    if (iconHref.includes("donut") || iconHref.includes("ceo")) return "ceo";
    if (name.includes("ceo") || desc.includes("ceo")) return "ceo";
    // POI: câmera, prédio, antena, torre, etc.
    if (
      folderLower.includes("camera") || folderLower.includes("câmera") ||
      folderLower.includes("predio") || folderLower.includes("prédio") ||
      folderLower.includes("antena") || folderLower.includes("torre") ||
      folderLower.includes("poi") || folderLower.includes("ponto de interesse") ||
      name.includes("camera") || name.includes("câmera") ||
      name.includes("predio") || name.includes("prédio") ||
      name.includes("antena") || name.includes("torre")
    ) return "poi";
    // Ponto genérico com ícone padrão do Google Earth → POI
    if (iconHref.includes("placemark") || iconHref.includes("ylw-pushpin") || iconHref.includes("paddle") || iconHref === "") return "poi";
    // Fallback → CEO
    return "ceo";
  };
  const getFolderPath = (pm: Element): string[] => {
    const path: string[] = [];
    let parent = pm.parentElement;
    while (parent) {
      if (parent.tagName === "Folder") {
        const n = parent.querySelector(":scope > name")?.textContent?.trim();
        if (n) path.unshift(n);
      }
      parent = parent.parentElement;
    }
    return path;
  };
  const placemarks = Array.from(doc.querySelectorAll("Placemark"));
  const items: KmlPreviewItem[] = [];
  let idx = 0;
  for (const pm of placemarks) {
    const name = pm.querySelector("name")?.textContent?.trim() ?? "";
    const folderPath = getFolderPath(pm);
    const folderName = folderPath[folderPath.length - 1] ?? "";
    const type = detectType(pm, folderName);
    const folderLabel = folderPath.join(" / ");
    // Extrair o href do ícone para reconhecimento visual (resolve StyleMap e Style)
    const pmStyleUrl = pm.querySelector("styleUrl")?.textContent?.trim() ?? "";
    const pmIconHref = resolveIconHref(pmStyleUrl, pm);
    // Categoria POI derivada do nome/pasta
    const poiCatRaw = (folderName || name).toLowerCase();
    const poiCategory = poiCatRaw.includes("camera") || poiCatRaw.includes("c\u00e2mera") ? "camera" :
      poiCatRaw.includes("predio") || poiCatRaw.includes("pr\u00e9dio") ? "predio" :
      poiCatRaw.includes("antena") ? "antena" :
      poiCatRaw.includes("torre") ? "torre" : "geral";
    if (type === "cabo") {
      const coordsText = pm.querySelector("LineString > coordinates")?.textContent?.trim() ?? "";
      if (!coordsText) continue;
      const pathPoints = coordsText.trim().split(/\s+/).map(c => {
        const p = c.split(","); return { lat: parseFloat(p[1]), lng: parseFloat(p[0]) };
      }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
      if (pathPoints.length < 2) continue;
      const desc = pm.querySelector("description")?.textContent?.trim() ?? "";
      const fiberName = extractFiberName(name || `Cabo-KML-${idx + 1}`, desc);
      const cableColor = resolveLineColor(pmStyleUrl, pm) ?? "#22d3ee";
      items.push({ id: `kml-${idx}`, name: fiberName, type: "cabo", color: cableColor, lat: null, lng: null, path: JSON.stringify(pathPoints), fiberName, include: true, folderName: folderLabel, fiberCount: 12, cableType: "FO", capacity: 8, sizeMeters: 0, iconHref: pmIconHref, selected: false, poiCategory });
    } else {
      // Tentar ponto direto ou dentro de MultiGeometry
      const coordText = (pm.querySelector("Point > coordinates") ?? pm.querySelector("MultiGeometry Point > coordinates"))?.textContent?.trim();
      if (!coordText) continue;
      const parts = coordText.split(",");
      if (parts.length < 2) continue;
      const lng = parseFloat(parts[0]); const lat = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lng)) continue;
      items.push({ id: `kml-${idx}`, name: name || `${type.toUpperCase()}-KML-${idx + 1}`, type, color: null, lat, lng, path: null, fiberName: null, include: true, folderName: folderLabel, fiberCount: 12, cableType: "FO", capacity: 8, sizeMeters: 0, iconHref: pmIconHref, selected: false, poiCategory });
    }
    idx++;
  }
  return items;
}
