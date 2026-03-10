/**
 * networkSnmpPoller.ts
 * Polling SNMP para equipamentos de rede (switches, roteadores, OLTs, etc.)
 * Coleta: CPU, memória, temperatura, uptime, tráfego por porta, GBIC (DOM)
 */

import * as snmp from "net-snmp";
import { getDb } from "./db";
import {
  networkSnmpConfig,
  networkSnmpPorts,
  networkSnmpReadings,
  networkPortReadings,
  networkSnmpAlerts,
  equipments,
} from "../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

// ─── OIDs padrão (RFC 1213 / IF-MIB / HOST-RESOURCES-MIB) ────────────────────

const OID = {
  // System
  sysDescr:     "1.3.6.1.2.1.1.1.0",
  sysUpTime:    "1.3.6.1.2.1.1.3.0",
  sysName:      "1.3.6.1.2.1.1.5.0",

  // IF-MIB (tabela de interfaces)
  ifNumber:     "1.3.6.1.2.1.2.1.0",
  ifDescr:      "1.3.6.1.2.1.2.2.1.2",       // tabela: ifDescr.ifIndex
  ifType:       "1.3.6.1.2.1.2.2.1.3",
  ifSpeed:      "1.3.6.1.2.1.2.2.1.5",
  ifOperStatus: "1.3.6.1.2.1.2.2.1.8",
  ifAdminStatus:"1.3.6.1.2.1.2.2.1.7",
  ifInOctets:   "1.3.6.1.2.1.2.2.1.10",
  ifOutOctets:  "1.3.6.1.2.1.2.2.1.16",
  // IF-MIB HC (64-bit) — obrigatório para portas 10G/100G (RFC 2863)
  ifHCInOctets:  "1.3.6.1.2.1.31.1.1.1.6",   // ifHCInOctets  (64-bit)
  ifHCOutOctets: "1.3.6.1.2.1.31.1.1.1.10",  // ifHCOutOctets (64-bit)
  ifHighSpeed:   "1.3.6.1.2.1.31.1.1.1.15",  // ifHighSpeed em Mbps (para portas >1G)
  ifAlias:      "1.3.6.1.2.1.31.1.1.1.18",   // IF-MIB ifAlias

  // HOST-RESOURCES-MIB (CPU e memória)
  hrProcessorLoad:     "1.3.6.1.2.1.25.3.3.1.2",  // tabela: hrProcessorLoad.index
  hrStorageUsed:       "1.3.6.1.2.1.25.2.3.1.6",
  hrStorageSize:       "1.3.6.1.2.1.25.2.3.1.5",
  hrStorageType:       "1.3.6.1.2.1.25.2.3.1.2",
  hrStorageRam:        "1.3.6.1.2.1.25.2.1.2",    // OID do tipo RAM

  // Temperatura — varia por fabricante, tentamos os mais comuns
  // Cisco: 1.3.6.1.4.1.9.9.13.1.3.1.3
  // Huawei: 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.11
  // MikroTik: 1.3.6.1.4.1.14988.1.1.3.10.0
  // Datacom: 1.3.6.1.4.1.3709.3.5.203.1.1.5.1.1
  tempCisco:    "1.3.6.1.4.1.9.9.13.1.3.1.3.1",
  tempHuawei:   "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.11.0",
  tempMikrotik: "1.3.6.1.4.1.14988.1.1.3.10.0",

  // GBIC / DOM (Digital Optical Monitoring) — ENTITY-SENSOR-MIB ou vendor-specific
  // MikroTik: 1.3.6.1.4.1.14988.1.1.19.1.1 (sfp table)
  sfpRxPowerMikrotik: "1.3.6.1.4.1.14988.1.1.19.1.1.4",
  sfpTxPowerMikrotik: "1.3.6.1.4.1.14988.1.1.19.1.1.5",
  sfpTempMikrotik:    "1.3.6.1.4.1.14988.1.1.19.1.1.2",

  // Huawei DOM — hwEntityOpticalInfoTable (1.3.6.1.4.1.2011.5.25.31.1.1.3.1)
  // Índice = entPhysicalIndex do módulo óptico (obtido via hwEntityOpticalIfIndex)
  hwOptRxPower:   "1.3.6.1.4.1.2011.5.25.31.1.1.3.1.4",  // RX em 0.01 dBm
  hwOptTxPower:   "1.3.6.1.4.1.2011.5.25.31.1.1.3.1.6",  // TX em 0.01 dBm
  hwOptTemp:      "1.3.6.1.4.1.2011.5.25.31.1.1.3.1.2",  // Temperatura em 0.01 °C
  hwOptIfIndex:   "1.3.6.1.4.1.2011.5.25.31.1.1.3.1.13", // ifIndex da porta associada
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createSession(config: {
  snmpHost: string;
  snmpPort: number;
  snmpVersion: string;
  snmpCommunity?: string | null;
  snmpV3User?: string | null;
  snmpV3AuthProto?: string | null;
  snmpV3AuthKey?: string | null;
  snmpV3PrivProto?: string | null;
  snmpV3PrivKey?: string | null;
}) {
  const version =
    config.snmpVersion === "v3"
      ? snmp.Version3
      : config.snmpVersion === "v1"
      ? snmp.Version1
      : snmp.Version2c;

  if (config.snmpVersion === "v3" && config.snmpV3User) {
    return snmp.createV3Session(
      config.snmpHost,
      {
        name: config.snmpV3User,
        level:
          config.snmpV3AuthKey && config.snmpV3PrivKey
            ? snmp.SecurityLevel.authPriv
            : config.snmpV3AuthKey
            ? snmp.SecurityLevel.authNoPriv
            : snmp.SecurityLevel.noAuthNoPriv,
        authProtocol:
          config.snmpV3AuthProto === "SHA"
            ? snmp.AuthProtocols.sha
            : snmp.AuthProtocols.md5,
        authKey: config.snmpV3AuthKey ?? "",
        privProtocol:
          config.snmpV3PrivProto === "AES"
            ? snmp.PrivProtocols.aes
            : snmp.PrivProtocols.des,
        privKey: config.snmpV3PrivKey ?? "",
      },
      { port: config.snmpPort ?? 161, version: version as 3 }
    );
  }

  return snmp.createSession(
    config.snmpHost,
    config.snmpCommunity ?? "public",
    { port: config.snmpPort ?? 161, version: version as 0 | 1, timeout: 5000, retries: 1 }
  );
}

function snmpGet(session: snmp.Session, oids: string[]): Promise<Record<string, snmp.Varbind>> {
  return new Promise((resolve, reject) => {
    session.get(oids, (error: Error | null, varbinds?: snmp.Varbind[]) => {
      if (error) return reject(error);
      const result: Record<string, snmp.Varbind> = {};
      for (const vb of (varbinds ?? [])) {
        if (!snmp.isVarbindError(vb)) {
          result[vb.oid] = vb;
        }
      }
      resolve(result);
    });
  });
}

// snmpwalk manual via getNext em loop — simples, robusto, funciona em v1/v2c/v3
// Não usa getBulk para evitar problemas com equipamentos que retornam arrays malformados
function snmpGetSubtree(session: snmp.Session, rootOid: string, debug = false): Promise<snmp.Varbind[]> {
  return new Promise((resolve) => {
    const results: snmp.Varbind[] = [];
    const MAX_ITER = 2000; // limite de segurança (switches grandes podem ter 500+ interfaces)
    let iterations = 0;

    // Normalizar rootOid: remover ponto final se existir
    const root = rootOid.endsWith(".") ? rootOid.slice(0, -1) : rootOid;

    function step(currentOid: string) {
      if (iterations++ > MAX_ITER) {
        if (debug) console.log(`[snmpGetSubtree] MAX_ITER atingido em ${currentOid}, retornando ${results.length} entradas`);
        return resolve(results);
      }

      session.getNext([currentOid], (error: Error | null, varbinds?: snmp.Varbind[]) => {
        if (error) {
          if (debug) console.log(`[snmpGetSubtree] getNext erro em ${currentOid}: ${error.message}`);
          return resolve(results);
        }

        if (!varbinds || varbinds.length === 0) {
          if (debug) console.log(`[snmpGetSubtree] getNext retornou array vazio em ${currentOid}`);
          return resolve(results);
        }

        const vb = varbinds[0];

        // Proteger contra varbind undefined/null
        if (!vb || !vb.oid) {
          if (debug) console.log(`[snmpGetSubtree] Varbind undefined/null em ${currentOid}`);
          return resolve(results);
        }

        // Verificar se ainda estamos dentro da sub-árvore
        if (!vb.oid.startsWith(root + ".") && vb.oid !== root) {
          if (debug) console.log(`[snmpGetSubtree] Saiu da árvore: ${vb.oid} (raiz=${root}), total=${results.length}`);
          return resolve(results);
        }

        // Verificar se é um erro SNMP (noSuchObject, noSuchInstance, endOfMibView)
        if (snmp.isVarbindError(vb)) {
          if (debug) console.log(`[snmpGetSubtree] Erro SNMP no varbind ${vb.oid}: type=${(vb as any).type}`);
          return resolve(results);
        }

        // OID igual ao anterior — loop infinito, parar
        if (results.length > 0 && results[results.length - 1].oid === vb.oid) {
          if (debug) console.log(`[snmpGetSubtree] OID repetido ${vb.oid}, parando`);
          return resolve(results);
        }

        if (debug) console.log(`[snmpGetSubtree] [${iterations}] ${vb.oid} = ${JSON.stringify(vb.value)}`);
        results.push(vb);
        step(vb.oid);
      });
    }

    step(root);
  });
}

function varbindValue(vb: snmp.Varbind | undefined): number | string | null {
  if (!vb) return null;
  const v = vb.value;
  if (Buffer.isBuffer(v)) return v.toString("utf8").replace(/\0/g, "").trim();
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  return null;
}

function toNumber(v: number | string | null): number | null {
  if (v === null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}

// Converte centésimos de segundo (TimeTicks) para segundos
function ticksToSeconds(ticks: number): number {
  return Math.floor(ticks / 100);
}

// ─── Exportar funções auxiliares para uso no router ───────────────────────────
export { createSession, snmpGet, varbindValue, ticksToSeconds };
export const SNMP_OID = OID;

// ─── Coleta principal por equipamento ────────────────────────────────────────

export async function pollNetworkEquipment(equipmentId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [cfg] = await db
    .select()
    .from(networkSnmpConfig)
    .where(eq(networkSnmpConfig.equipmentId, equipmentId));

  if (!cfg || !cfg.enabled || !cfg.snmpHost) {
    console.log(`[NetworkSNMP] poll(${equipmentId}): cfg ausente/disabled/sem host. cfg=${JSON.stringify(cfg ? { enabled: cfg.enabled, host: cfg.snmpHost } : null)}`);
    return;
  }
  console.log(`[NetworkSNMP] Iniciando poll equipmentId=${equipmentId} host=${cfg.snmpHost}:${cfg.snmpPort} version=${cfg.snmpVersion}`);

  const [eq_] = await db
    .select({ name: equipments.name, manufacturer: equipments.manufacturer })
    .from(equipments)
    .where(eq(equipments.id, equipmentId));

  const session = createSession(cfg as any);
  const now = new Date();

  try {
    // ── 1. Dados gerais do sistema ──────────────────────────────────────────
    let cpuPercent: number | null = null;
    let memPercent: number | null = null;
    let temperature: number | null = null;
    let uptimeSeconds: number | null = null;

    // sysUpTime
    try {
      const sysVbs = await snmpGet(session, [OID.sysUpTime]);
      const uptime = toNumber(varbindValue(sysVbs[OID.sysUpTime]));
      if (uptime !== null) uptimeSeconds = ticksToSeconds(uptime);
    } catch (_) { /* ignorar */ }

    // CPU — hrProcessorLoad (tabela)
    try {
      const cpuVbs = await snmpGetSubtree(session, OID.hrProcessorLoad);
      if (cpuVbs.length > 0) {
        const loads = cpuVbs.map((v) => toNumber(varbindValue(v))).filter((v) => v !== null) as number[];
        if (loads.length > 0) {
          cpuPercent = Math.round(loads.reduce((a, b) => a + b, 0) / loads.length);
        }
      }
    } catch (_) { /* ignorar */ }

    // Memória — hrStorage
    try {
      const storageTypes = await snmpGetSubtree(session, OID.hrStorageType);
      for (const typeVb of storageTypes) {
        const oidParts = typeVb.oid.split(".");
        const idx = oidParts[oidParts.length - 1];
        const typeVal = varbindValue(typeVb);
        // hrStorageRam OID = 1.3.6.1.2.1.25.2.1.2
        if (typeof typeVal === "string" && typeVal.includes("1.3.6.1.2.1.25.2.1.2")) {
          const usedOid = `${OID.hrStorageUsed}.${idx}`;
          const sizeOid = `${OID.hrStorageSize}.${idx}`;
          const memVbs = await snmpGet(session, [usedOid, sizeOid]);
          const used = toNumber(varbindValue(memVbs[usedOid]));
          const size = toNumber(varbindValue(memVbs[sizeOid]));
          if (used !== null && size !== null && size > 0) {
            memPercent = Math.round((used / size) * 100);
          }
          break;
        }
      }
    } catch (_) { /* ignorar */ }

    // Temperatura — tenta vários OIDs por fabricante
    const manufacturer = (eq_?.manufacturer ?? "").toLowerCase();
    const tempOids: string[] = [];
    if (manufacturer.includes("mikrotik")) tempOids.push(OID.tempMikrotik);
    if (manufacturer.includes("huawei")) tempOids.push(OID.tempHuawei);
    if (manufacturer.includes("cisco")) tempOids.push(OID.tempCisco);
    // Tenta todos se não identificado
    if (tempOids.length === 0) {
      tempOids.push(OID.tempMikrotik, OID.tempHuawei, OID.tempCisco);
    }

    for (const tempOid of tempOids) {
      try {
        const tempVbs = await snmpGet(session, [tempOid]);
        const t = toNumber(varbindValue(tempVbs[tempOid]));
        if (t !== null && t > 0 && t < 200) {
          temperature = t;
          break;
        }
      } catch (_) { /* ignorar */ }
    }

    // ── 2. Salvar leitura geral ─────────────────────────────────────────────
    await db.insert(networkSnmpReadings).values({
      equipmentId,
      cpuPercent: cpuPercent ?? undefined,
      memPercent: memPercent ?? undefined,
      temperature: temperature ?? undefined,
      uptimeSeconds: uptimeSeconds ?? undefined,
    });
    // ── 3. Interfaces (IF-MIB) ──────────────────────────────────────────────────────
    try {
      const ifDescrVbs = await snmpGetSubtree(session, OID.ifDescr);
      console.log(`[NetworkSNMP] poll(${equipmentId}): ifDescr subtree retornou ${ifDescrVbs.length} entradas`);
      const ifIndexes = ifDescrVbs.map((v) => {  const parts = v.oid.split(".");
        return parseInt(parts[parts.length - 1]);
      });

      for (const ifIndex of ifIndexes) {
        const oids = [
          `${OID.ifDescr}.${ifIndex}`,
          `${OID.ifType}.${ifIndex}`,
          `${OID.ifSpeed}.${ifIndex}`,
          `${OID.ifHighSpeed}.${ifIndex}`,   // Mbps para portas >1G
          `${OID.ifOperStatus}.${ifIndex}`,
          `${OID.ifAdminStatus}.${ifIndex}`,
          `${OID.ifInOctets}.${ifIndex}`,
          `${OID.ifOutOctets}.${ifIndex}`,
          `${OID.ifHCInOctets}.${ifIndex}`,  // 64-bit (10G/100G)
          `${OID.ifHCOutOctets}.${ifIndex}`, // 64-bit (10G/100G)
          `${OID.ifAlias}.${ifIndex}`,
        ];

        let ifVbs: Record<string, snmp.Varbind> = {};
        try {
          ifVbs = await snmpGet(session, oids);
        } catch (_) { continue; }

        const ifName = String(varbindValue(ifVbs[`${OID.ifDescr}.${ifIndex}`]) ?? "");
        const ifAlias = String(varbindValue(ifVbs[`${OID.ifAlias}.${ifIndex}`]) ?? "");
        // ifHighSpeed (Mbps) tem prioridade para portas >1G; ifSpeed (bps) para portas lentas
        // 4294967295 (0xFFFFFFFF) = velocidade desconhecida no SNMP, guardar como null
        const rawSpeed = toNumber(varbindValue(ifVbs[`${OID.ifSpeed}.${ifIndex}`]));
        const rawHighSpeed = toNumber(varbindValue(ifVbs[`${OID.ifHighSpeed}.${ifIndex}`]));
        // ifHighSpeed em Mbps → converter para bps; usar quando ifSpeed = 0xFFFFFFFF ou porta >1G
        const ifSpeed = rawHighSpeed !== null && rawHighSpeed > 0
          ? rawHighSpeed * 1_000_000  // Mbps → bps
          : (rawSpeed === null || rawSpeed >= 4294967295) ? null : rawSpeed;
        const ifType = String(varbindValue(ifVbs[`${OID.ifType}.${ifIndex}`]) ?? "");
        const operStatusRaw = toNumber(varbindValue(ifVbs[`${OID.ifOperStatus}.${ifIndex}`]));
        const adminStatusRaw = toNumber(varbindValue(ifVbs[`${OID.ifAdminStatus}.${ifIndex}`]));
        // Usar contadores HC (64-bit) se disponíveis — obrigatório para portas 10G/100G
        // Fallback para contadores de 32-bit se HC não suportado pelo equipamento
        const MAX_SAFE_BIGINT = 9007199254740991; // Number.MAX_SAFE_INTEGER
        const rawHCIn  = toNumber(varbindValue(ifVbs[`${OID.ifHCInOctets}.${ifIndex}`]));
        const rawHCOut = toNumber(varbindValue(ifVbs[`${OID.ifHCOutOctets}.${ifIndex}`]));
        const rawIn    = toNumber(varbindValue(ifVbs[`${OID.ifInOctets}.${ifIndex}`]));
        const rawOut   = toNumber(varbindValue(ifVbs[`${OID.ifOutOctets}.${ifIndex}`]));
        // Preferir HC (64-bit); fallback para 32-bit
        const bestIn  = rawHCIn  !== null ? rawHCIn  : rawIn;
        const bestOut = rawHCOut !== null ? rawHCOut : rawOut;
        const inOctets  = bestIn  !== null ? Math.min(bestIn,  MAX_SAFE_BIGINT) : null;
        const outOctets = bestOut !== null ? Math.min(bestOut, MAX_SAFE_BIGINT) : null;

        const operStatusMap: Record<number, string> = {
          1: "up", 2: "down", 3: "testing", 4: "unknown",
          5: "dormant", 6: "notPresent", 7: "lowerLayerDown",
        };
        const adminStatusMap: Record<number, string> = { 1: "up", 2: "down", 3: "testing" };

        const operStatus = (operStatusMap[operStatusRaw ?? 4] ?? "unknown") as any;
        const adminStatus = (adminStatusMap[adminStatusRaw ?? 1] ?? "up") as any;

        // Buscar porta existente
        const [existingPort] = await db
          .select()
          .from(networkSnmpPorts)
          .where(
            and(
              eq(networkSnmpPorts.equipmentId, equipmentId),
              eq(networkSnmpPorts.ifIndex, ifIndex)
            )
          );

        // Calcular bps usando tempo REAL entre polls (não o intervalo configurado)
        // Tratar wrap-around de contadores 32-bit (max ~4.29 GB) e 64-bit
        let inBps: number | null = null;
        let outBps: number | null = null;
        if (existingPort && existingPort.lastInOctets !== null && inOctets !== null) {
          // Usar tempo real desde o último poll; fallback para intervalo configurado
          const lastPollMs = existingPort.lastPollAt ? new Date(existingPort.lastPollAt).getTime() : 0;
          const elapsedMs = lastPollMs > 0 ? (now.getTime() - lastPollMs) : (cfg.pollInterval ?? 300) * 1000;
          const elapsed = elapsedMs / 1000; // converter para segundos

          // Calcular diferença com tratamento de wrap-around
          // Contadores 32-bit fazem wrap em 2^32 = 4294967296
          // Contadores 64-bit (HC) raramente fazem wrap, mas tratar igualmente
          const WRAP32 = 4294967296;
          let inDiff = inOctets - existingPort.lastInOctets;
          let outDiff = (outOctets ?? 0) - (existingPort.lastOutOctets ?? 0);

          // Se a diferença for negativa e pequena (< 2^32), provavelmente é wrap-around 32-bit
          if (inDiff < 0 && inDiff > -WRAP32) inDiff += WRAP32;
          if (outDiff < 0 && outDiff > -WRAP32) outDiff += WRAP32;

          // Sanidade: ignorar valores impossíveis (> 10 Gbps * elapsed)
          const MAX_BPS = 100_000_000_000; // 100 Gbps máximo razoável
          const maxOctets = (MAX_BPS / 8) * elapsed;

          if (inDiff >= 0 && inDiff <= maxOctets && elapsed > 0)
            inBps = Math.round((inDiff * 8) / elapsed);
          if (outDiff >= 0 && outDiff <= maxOctets && elapsed > 0)
            outBps = Math.round((outDiff * 8) / elapsed);
        }

        if (existingPort) {
          await db
            .update(networkSnmpPorts)
            .set({
              ifName: ifName || undefined,
              ifAlias: ifAlias || undefined,
              ifSpeed: ifSpeed ?? undefined,
              ifType: ifType || undefined,
              ifOperStatus: operStatus,
              ifAdminStatus: adminStatus,
              lastInBps: inBps ?? undefined,
              lastOutBps: outBps ?? undefined,
              lastInOctets: inOctets ?? undefined,
              lastOutOctets: outOctets ?? undefined,
              lastPollAt: now,
            })
            .where(eq(networkSnmpPorts.id, existingPort.id));

          // Salvar histórico de tráfego
          if (inBps !== null || outBps !== null) {
            try {
              await db.insert(networkPortReadings).values({
                portId: existingPort.id,
                equipmentId,
                inBps: inBps ?? undefined,
                outBps: outBps ?? undefined,
              });
              console.log(`[NetworkSNMP] poll(${equipmentId}): INSERT portReadings portId=${existingPort.id} inBps=${inBps} outBps=${outBps}`);
            } catch (insertErr: any) {
              console.error(`[NetworkSNMP] poll(${equipmentId}): ERRO INSERT portReadings portId=${existingPort.id}:`, insertErr?.message ?? insertErr);
            }
          }

          // Alerta de threshold de tráfego
          if (existingPort.alertBpsMax !== null && existingPort.alertBpsMax !== undefined) {
            const maxBps = Math.max(inBps ?? 0, outBps ?? 0);
            if (maxBps > existingPort.alertBpsMax) {
              const maxMbps = (maxBps / 1_000_000).toFixed(2);
              const threshMbps = (existingPort.alertBpsMax / 1_000_000).toFixed(2);
              await createNetworkAlert(
                equipmentId, existingPort.id, "traffic_high", "warning",
                `Tráfego alto em ${ifName}: ${maxMbps} Mbps (limite: ${threshMbps} Mbps)`,
                maxBps, existingPort.alertBpsMax
              );
            }
          }
          // Alertas de porta down
          if (operStatus === "down" && adminStatus === "up") {
            await createNetworkAlert(equipmentId, existingPort.id, "port_down", "warning",
              `Porta ${ifName} (ifIndex ${ifIndex}) está DOWN`, null, null);
          }
        } else {
          // Criar nova porta
          await db.insert(networkSnmpPorts).values({
            equipmentId,
            ifIndex,
            ifName: ifName || undefined,
            ifAlias: ifAlias || undefined,
            ifSpeed: ifSpeed ?? undefined,
            ifType: ifType || undefined,
            ifOperStatus: operStatus,
            ifAdminStatus: adminStatus,
            lastInOctets: inOctets ?? undefined,
            lastOutOctets: outOctets ?? undefined,
            lastPollAt: now,
          });
        }
      }
    } catch (ifErr) { console.error(`[NetworkSNMP] poll(${equipmentId}): erro na seção de interfaces:`, ifErr); }

    // ── 4. GBIC / DOM (MikroTik) ───────────────────────────────────────────
    if (manufacturer.includes("mikrotik")) {
      try {
        const rxVbs = await snmpGetSubtree(session, OID.sfpRxPowerMikrotik);
        const txVbs = await snmpGetSubtree(session, OID.sfpTxPowerMikrotik);
        const tempVbs = await snmpGetSubtree(session, OID.sfpTempMikrotik);

        for (const rxVb of rxVbs) {
          const parts = rxVb.oid.split(".");
          const sfpIdx = parseInt(parts[parts.length - 1]);
          const rxRaw = toNumber(varbindValue(rxVb));
          const txVb = txVbs.find((v) => v.oid.endsWith(`.${sfpIdx}`));
          const tempVb = tempVbs.find((v) => v.oid.endsWith(`.${sfpIdx}`));

          // MikroTik retorna valores em 0.001 dBm (dividir por 1000)
          const rxDbm = rxRaw !== null ? rxRaw / 1000 : null;
          const txDbm = txVb ? (toNumber(varbindValue(txVb)) ?? 0) / 1000 : null;
          const gbicTemp = tempVb ? toNumber(varbindValue(tempVb)) : null;

          // Buscar porta pelo ifIndex (SFP index no MikroTik corresponde ao ifIndex)
          const [port] = await db
            .select()
            .from(networkSnmpPorts)
            .where(
              and(
                eq(networkSnmpPorts.equipmentId, equipmentId),
                eq(networkSnmpPorts.ifIndex, sfpIdx)
              )
            );

          if (port) {
            await db
              .update(networkSnmpPorts)
              .set({
                gbicEnabled: true,
                lastRxPowerDbm: rxDbm ?? undefined,
                lastTxPowerDbm: txDbm ?? undefined,
                lastGbicTemp: gbicTemp ?? undefined,
              })
              .where(eq(networkSnmpPorts.id, port.id));

            // Salvar histórico GBIC
            await db.insert(networkPortReadings).values({
              portId: port.id,
              equipmentId,
              rxPowerDbm: rxDbm ?? undefined,
              txPowerDbm: txDbm ?? undefined,
              gbicTemp: gbicTemp ?? undefined,
            });

            // Alertas de sinal óptico
            if (rxDbm !== null && port.alertRxMin !== null && rxDbm < port.alertRxMin) {
              await createNetworkAlert(equipmentId, port.id, "rx_power_low", "warning",
                `Sinal RX baixo em ${port.ifName}: ${rxDbm.toFixed(2)} dBm (mín: ${port.alertRxMin} dBm)`,
                rxDbm, port.alertRxMin);
            }
          }
        }
      } catch (_) { /* ignorar */ }
    }

    // ── 4b. GBIC / DOM (Huawei) ────────────────────────────────────────────
    // hwEntityOpticalInfoTable: índice = entPhysicalIndex do módulo óptico
    // hwOptIfIndex mapeia entPhysicalIndex → ifIndex da porta
    if (manufacturer.includes("huawei")) {
      try {
        // Obter mapeamento entPhysicalIndex → ifIndex
        const ifIndexVbs = await snmpGetSubtree(session, OID.hwOptIfIndex);
        if (ifIndexVbs.length > 0) {
          const rxVbs  = await snmpGetSubtree(session, OID.hwOptRxPower);
          const txVbs  = await snmpGetSubtree(session, OID.hwOptTxPower);
          const tmpVbs = await snmpGetSubtree(session, OID.hwOptTemp);

          for (const ifIdxVb of ifIndexVbs) {
            const parts = ifIdxVb.oid.split(".");
            const physIdx = parts[parts.length - 1];
            const ifIdxVal = toNumber(varbindValue(ifIdxVb));
            if (ifIdxVal === null || ifIdxVal === 0) continue;

            const rxVb  = rxVbs.find((v) => v.oid.endsWith(`.${physIdx}`));
            const txVb  = txVbs.find((v) => v.oid.endsWith(`.${physIdx}`));
            const tmpVb = tmpVbs.find((v) => v.oid.endsWith(`.${physIdx}`));

            // Huawei retorna valores em 0.01 dBm e 0.01 °C
            const rxRaw = rxVb  ? toNumber(varbindValue(rxVb))  : null;
            const txRaw = txVb  ? toNumber(varbindValue(txVb))  : null;
            const tRaw  = tmpVb ? toNumber(varbindValue(tmpVb)) : null;

            const rxDbm    = rxRaw !== null ? rxRaw / 100 : null;
            const txDbm    = txRaw !== null ? txRaw / 100 : null;
            const gbicTemp = tRaw  !== null ? tRaw  / 100 : null;

            // Ignorar valores claramente inválidos (sem módulo inserido)
            if (rxDbm === null && txDbm === null) continue;
            if (rxDbm !== null && (rxDbm < -50 || rxDbm > 10)) continue;

            const [port] = await db
              .select()
              .from(networkSnmpPorts)
              .where(
                and(
                  eq(networkSnmpPorts.equipmentId, equipmentId),
                  eq(networkSnmpPorts.ifIndex, ifIdxVal)
                )
              );

            if (port) {
              await db
                .update(networkSnmpPorts)
                .set({
                  gbicEnabled: true,
                  lastRxPowerDbm: rxDbm ?? undefined,
                  lastTxPowerDbm: txDbm ?? undefined,
                  lastGbicTemp: gbicTemp ?? undefined,
                })
                .where(eq(networkSnmpPorts.id, port.id));

              await db.insert(networkPortReadings).values({
                portId: port.id,
                equipmentId,
                rxPowerDbm: rxDbm ?? undefined,
                txPowerDbm: txDbm ?? undefined,
                gbicTemp: gbicTemp ?? undefined,
              });

              if (rxDbm !== null && port.alertRxMin !== null && rxDbm < port.alertRxMin) {
                await createNetworkAlert(equipmentId, port.id, "rx_power_low", "warning",
                  `Sinal RX baixo em ${port.ifName}: ${rxDbm.toFixed(2)} dBm (mín: ${port.alertRxMin} dBm)`,
                  rxDbm, port.alertRxMin);
              }
            }
          }
        }
      } catch (_) { /* ignorar — equipamento pode não suportar hwEntityOpticalInfoTable */ }
    }

    // ── 5. Alertas de CPU/Memória/Temperatura ──────────────────────────────
    if (cfg.alertsEnabled) {
      if (cpuPercent !== null && cfg.alertCpuMax !== null && cpuPercent > cfg.alertCpuMax) {
        await createNetworkAlert(equipmentId, null, "cpu_high", "warning",
          `CPU alta em ${eq_?.name}: ${cpuPercent}% (máx: ${cfg.alertCpuMax}%)`,
          cpuPercent, cfg.alertCpuMax);
      }
      if (memPercent !== null && cfg.alertMemMax !== null && memPercent > cfg.alertMemMax) {
        await createNetworkAlert(equipmentId, null, "mem_high", "warning",
          `Memória alta em ${eq_?.name}: ${memPercent}% (máx: ${cfg.alertMemMax}%)`,
          memPercent, cfg.alertMemMax);
      }
      if (temperature !== null && cfg.alertTempMax !== null && temperature > cfg.alertTempMax) {
        await createNetworkAlert(equipmentId, null, "temp_high", "critical",
          `Temperatura alta em ${eq_?.name}: ${temperature}°C (máx: ${cfg.alertTempMax}°C)`,
          temperature, cfg.alertTempMax);
      }
    }

    // ── 6. Atualizar timestamp e limpar erro ────────────────────────────────
    await db
      .update(networkSnmpConfig)
      .set({
        lastPollAt: now,
        lastPollError: null,
        lastCpuPercent: cpuPercent ?? undefined,
        lastMemPercent: memPercent ?? undefined,
        lastTemperature: temperature ?? undefined,
        lastUptimeSeconds: uptimeSeconds ?? undefined,
      })
      .where(eq(networkSnmpConfig.equipmentId, equipmentId));

  } catch (err: any) {
    const errorMsg = err?.message ?? String(err);
    await db
      .update(networkSnmpConfig)
      .set({ lastPollAt: now, lastPollError: errorMsg })
      .where(eq(networkSnmpConfig.equipmentId, equipmentId));

    if (cfg.alertsEnabled) {
      await createNetworkAlert(equipmentId, null, "snmp_unreachable", "critical",
        `Equipamento ${eq_?.name} não responde ao SNMP: ${errorMsg}`, null, null);
    }
  } finally {
    session.close();
  }
}

// ─── Criar alerta (evita duplicatas de alertas não resolvidos) ────────────────

async function createNetworkAlert(
  equipmentId: number,
  portId: number | null,
  alertType: any,
  severity: any,
  message: string,
  currentValue: number | null,
  thresholdValue: number | null
) {
  const db = await getDb();
  if (!db) return;
  // Verificar se já existe alerta ativo do mesmo tipo
  const existing = await db
    .select({ id: networkSnmpAlerts.id })
    .from(networkSnmpAlerts)
    .where(
      and(
        eq(networkSnmpAlerts.equipmentId, equipmentId),
        eq(networkSnmpAlerts.alertType, alertType),
        isNull(networkSnmpAlerts.resolvedAt)
      )
    );
  if (existing.length > 0) return; // já existe alerta ativo
  await db.insert(networkSnmpAlerts).values({
    equipmentId,
    portId: portId ?? undefined,
    alertType,
    severity,
    message,
    currentValue: currentValue ?? undefined,
    thresholdValue: thresholdValue ?? undefined,
  });

  // Notificar owner para alertas críticos
  if (severity === "critical") {
    try {
      await notifyOwner({ title: `🚨 Alerta SNMP: ${alertType}`, content: message });
    } catch (_) { /* ignorar */ }
  }
}

// ─── Scheduler: verificar todos os equipamentos habilitados ──────────────────────────────

let pollerTimer: ReturnType<typeof setInterval> | null = null;
// Rastreia equipamentos com poll em curso para evitar polls concorrentes
const activePolls = new Set<number>();

export function startNetworkSnmpPoller() {
  if (pollerTimer) return;

  const CHECK_INTERVAL_MS = 60_000; // verificar a cada 60s quais equipamentos precisam de poll

  pollerTimer = setInterval(async () => {
    try {
      const db = await getDb();
      if (!db) return;
      const configs = await db
        .select()
        .from(networkSnmpConfig)
        .where(eq(networkSnmpConfig.enabled, true));

      const now = Date.now();
      for (const cfg of configs) {
        if (!cfg.snmpHost) continue;
        // Ignorar se já há um poll em curso para este equipamento
        if (activePolls.has(cfg.equipmentId)) {
          console.log(`[NetworkSNMP] poll(${cfg.equipmentId}): já em curso, a saltar`);
          continue;
        }
        const pollIntervalMs = (cfg.pollInterval ?? 300) * 1000;
        const lastPoll = cfg.lastPollAt ? new Date(cfg.lastPollAt).getTime() : 0;
        if (now - lastPoll >= pollIntervalMs) {
          activePolls.add(cfg.equipmentId);
          pollNetworkEquipment(cfg.equipmentId)
            .catch((e) => console.error(`[NetworkSNMP] Erro ao fazer poll do equipamento ${cfg.equipmentId}:`, e))
            .finally(() => activePolls.delete(cfg.equipmentId));
        }
      }
    } catch (e) {
      console.error("[NetworkSNMP] Erro no scheduler:", e);
    }
  }, CHECK_INTERVAL_MS);

  console.log("[NetworkSNMP] Poller iniciado (verificação a cada 60s)");
}

export function stopNetworkSnmpPoller() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
}
