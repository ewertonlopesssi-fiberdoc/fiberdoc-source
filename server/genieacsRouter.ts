import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { systemSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  getSgpConfig,
  sgpGetOnuBySerial,
  sgpGetOnuDetail,
  sgpConfigureOnuWan,
  sgpConfigureOnuWifi,
} from "./sgpApi";

// ─── GenieACS API Helper ──────────────────────────────────────────────────────

async function getGenieACSConfig(): Promise<{ url: string; auth: string | null }> {
  const db = await getDb();
  if (!db) return { url: "http://127.0.0.1:7557", auth: null };

  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "genieacs_url"));
  const urlRow = rows[0];

  const authRows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "genieacs_auth"));
  const authRow = authRows[0];

  const url = urlRow?.value || "http://127.0.0.1:7557";
  const auth = authRow?.value || null; // Base64 encoded "user:pass" or null

  return { url, auth };
}

async function genieRequest(
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: object
): Promise<any> {
  const { url, auth } = await getGenieACSConfig();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth) {
    headers["Authorization"] = `Basic ${auth}`;
  }

  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GenieACS API error ${response.status}: ${text}`);
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ─── Extrair valor de parâmetro TR-069 do objecto de dispositivo ──────────────
function getParam(device: any, ...paths: string[]): string | null {
  for (const path of paths) {
    const parts = path.split(".");
    let obj = device;
    for (const part of parts) {
      if (!obj || typeof obj !== "object") { obj = null; break; }
      obj = obj[part];
    }
    // GenieACS armazena como { _value: "...", _timestamp: ... }
    const val = obj?._value ?? obj?.value ?? obj;
    if (val !== null && val !== undefined && val !== "") {
      return String(val);
    }
  }
  return null;
}

// ─── Normalizar dispositivo GenieACS para formato FiberDoc ───────────────────
function normalizeDevice(device: any) {
  const id = device._id;

  // Sinal óptico — vários caminhos possíveis dependendo do modelo
  const rxPower = getParam(device,
    "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPONLinkConfig.RXPower",
    "Device.Optical.Interface.1.CurrentReceivePower",
    "InternetGatewayDevice.X_CT-COM_GponInterfaceConfig.RXPower"
  );

  // IP WAN
  const wanIp = getParam(device,
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress",
    "Device.IP.Interface.1.IPv4Address.1.IPAddress"
  );

  // Wi-Fi 2.4GHz
  const ssid24 = getParam(device,
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
    "Device.WiFi.SSID.1.SSID"
  );

  // Uptime
  const uptime = getParam(device,
    "InternetGatewayDevice.DeviceInfo.UpTime",
    "Device.DeviceInfo.UpTime"
  );

  // Modelo e fabricante
  const manufacturer = getParam(device,
    "InternetGatewayDevice.DeviceInfo.Manufacturer",
    "Device.DeviceInfo.Manufacturer"
  );
  const modelName = getParam(device,
    "InternetGatewayDevice.DeviceInfo.ModelName",
    "Device.DeviceInfo.ModelName",
    "InternetGatewayDevice.DeviceInfo.ProductClass"
  );
  const softwareVersion = getParam(device,
    "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
    "Device.DeviceInfo.SoftwareVersion"
  );

  // MAC LAN
  const macAddress = getParam(device,
    "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress",
    "Device.Ethernet.Interface.1.MACAddress"
  );

  // Último contacto
  const lastInform = device._lastInform?._value || device._lastInform || null;

  // Online: último inform há menos de 5 minutos
  const isOnline = lastInform
    ? (Date.now() - new Date(lastInform).getTime()) < 5 * 60 * 1000
    : false;

  return {
    id,
    manufacturer: manufacturer || "Desconhecido",
    modelName: modelName || "Desconhecido",
    softwareVersion: softwareVersion || null,
    macAddress: macAddress || null,
    wanIp: wanIp || null,
    ssid24: ssid24 || null,
    rxPower: rxPower ? parseFloat(rxPower) : null,
    uptime: uptime ? parseInt(uptime) : null,
    lastInform: lastInform ? new Date(lastInform).getTime() : null,
    isOnline,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const genieacsRouter = router({

  // Obter configuração GenieACS actual
  getConfig: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { url: "http://127.0.0.1:7557", username: "", hasPassword: false };
    const rows = await db.select().from(systemSettings);
    const config: Record<string, string> = {};
    for (const row of rows) {
      if (row.key.startsWith("genieacs_")) {
        config[row.key] = row.value || "";
      }
    }
    return {
      url: config["genieacs_url"] || "http://127.0.0.1:7557",
      username: config["genieacs_username"] || "",
      hasPassword: !!(config["genieacs_auth"]),
    };
  }),

  // Guardar configuração GenieACS
  saveConfig: protectedProcedure
    .input(z.object({
      url: z.string().url("URL inválido"),
      username: z.string().optional(),
      password: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de dados não disponível");
      await db.insert(systemSettings)
        .values({ key: "genieacs_url", value: input.url })
        .onDuplicateKeyUpdate({ set: { value: input.url } });

      if (input.username !== undefined) {
        await db.insert(systemSettings)
          .values({ key: "genieacs_username", value: input.username })
          .onDuplicateKeyUpdate({ set: { value: input.username } });
      }

      if (input.username && input.password) {
        const auth = Buffer.from(`${input.username}:${input.password}`).toString("base64");
        await db.insert(systemSettings)
          .values({ key: "genieacs_auth", value: auth })
          .onDuplicateKeyUpdate({ set: { value: auth } });
      } else if (input.username === "" && input.password === "") {
        await db.insert(systemSettings)
          .values({ key: "genieacs_auth", value: "" })
          .onDuplicateKeyUpdate({ set: { value: "" } });
      }

      return { success: true };
    }),

  // Testar conexão com GenieACS
  testConnection: protectedProcedure.mutation(async () => {
    try {
      await genieRequest("/devices?limit=1");
      return { success: true, message: "Conexão com GenieACS estabelecida com sucesso" };
    } catch (err: any) {
      return { success: false, message: err.message || "Falha na conexão" };
    }
  }),

  // Listar todos os dispositivos (ONTs) no GenieACS
  listDevices: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      onlineOnly: z.boolean().optional(),
      limit: z.number().min(1).max(500).default(100),
      skip: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      try {
        const projection = [
          "_id",
          "_lastInform",
          "InternetGatewayDevice.DeviceInfo.Manufacturer",
          "InternetGatewayDevice.DeviceInfo.ModelName",
          "InternetGatewayDevice.DeviceInfo.ProductClass",
          "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
          "InternetGatewayDevice.DeviceInfo.UpTime",
          "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
          "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress",
          "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress",
          "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower",
          "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress",
          "Device.DeviceInfo.Manufacturer",
          "Device.DeviceInfo.ModelName",
          "Device.DeviceInfo.SoftwareVersion",
          "Device.DeviceInfo.UpTime",
          "Device.WiFi.SSID.1.SSID",
        ].join(",");

        let query = "";
        if (input.search) {
          const escaped = encodeURIComponent(JSON.stringify({
            "_id": { "$regex": input.search, "$options": "i" }
          }));
          query = `&query=${escaped}`;
        }

        const devices = await genieRequest(
          `/devices?projection=${encodeURIComponent(projection)}&limit=${input.limit}&skip=${input.skip}${query}`
        );

        if (!Array.isArray(devices)) return { devices: [], total: 0 };

        let normalized = devices.map(normalizeDevice);

        if (input.onlineOnly) {
          normalized = normalized.filter(d => d.isOnline);
        }

        return { devices: normalized, total: normalized.length };
      } catch (err: any) {
        throw new Error(`Erro ao listar dispositivos: ${err.message}`);
      }
    }),

  // Obter detalhes completos de um dispositivo
  getDevice: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .query(async ({ input }) => {
      try {
        const encoded = encodeURIComponent(input.deviceId);
        const devices = await genieRequest(`/devices/${encoded}`);
        const device = Array.isArray(devices) ? devices[0] : devices;
        if (!device) throw new Error("Dispositivo não encontrado");

        const normalized = normalizeDevice(device);

        // Wi-Fi 5GHz
        const ssid5 = getParam(device,
          "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID",
          "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID",
          "Device.WiFi.SSID.2.SSID"
        );

        // Dispositivos conectados ao Wi-Fi
        const assocDevices: Array<{ mac: string; signal?: string }> = [];
        try {
          const lanDevice = device?.["InternetGatewayDevice"]?.["LANDevice"]?.["1"];
          const wlanConfig = lanDevice?.["WLANConfiguration"]?.["1"];
          const assocList = wlanConfig?.["AssociatedDevice"];
          if (assocList && typeof assocList === "object") {
            for (const [key, val] of Object.entries(assocList)) {
              if (key === "_object" || key === "_timestamp") continue;
              const entry = val as any;
              const mac = entry?.["AssociatedDeviceMACAddress"]?._value;
              if (mac) {
                assocDevices.push({
                  mac,
                  signal: entry?.["X_TP_SignalStrength"]?._value ||
                          entry?.["SignalStrength"]?._value || undefined,
                });
              }
            }
          }
        } catch { /* ignorar */ }

        return {
          ...normalized,
          ssid5: ssid5 || null,
          connectedDevices: assocDevices,
        };
      } catch (err: any) {
        throw new Error(`Erro ao obter dispositivo: ${err.message}`);
      }
    }),

  // Alterar Wi-Fi (SSID + senha)
  setWifi: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      ssid: z.string().min(1).max(32).optional(),
      password: z.string().min(8).max(63).optional(),
      band: z.enum(["2.4", "5", "both"]).default("2.4"),
    }))
    .mutation(async ({ input }) => {
      const parameterValues: Array<[string, string, string]> = [];

      const bands = input.band === "both" ? [1, 5] :
                    input.band === "5" ? [5] : [1];

      for (const idx of bands) {
        const base = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}`;
        if (input.ssid) {
          parameterValues.push([`${base}.SSID`, input.ssid, "xsd:string"]);
        }
        if (input.password) {
          parameterValues.push([`${base}.PreSharedKey.1.PreSharedKey`, input.password, "xsd:string"]);
          parameterValues.push([`${base}.KeyPassphrase`, input.password, "xsd:string"]);
        }
      }

      if (parameterValues.length === 0) {
        throw new Error("Nenhum parâmetro para alterar");
      }

      const encoded = encodeURIComponent(input.deviceId);
      await genieRequest(
        `/devices/${encoded}/tasks?connection_request`,
        "POST",
        { name: "setParameterValues", parameterValues }
      );

      return { success: true, message: "Configuração Wi-Fi enviada para a ONT" };
    }),

  // Reiniciar ONT
  reboot: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      const encoded = encodeURIComponent(input.deviceId);
      await genieRequest(
        `/devices/${encoded}/tasks?connection_request`,
        "POST",
        { name: "reboot" }
      );
      return { success: true, message: "Comando de reinicialização enviado para a ONT" };
    }),

  // Repor configuração de fábrica
  factoryReset: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      const encoded = encodeURIComponent(input.deviceId);
      await genieRequest(
        `/devices/${encoded}/tasks?connection_request`,
        "POST",
        { name: "factoryReset" }
      );
      return { success: true, message: "Reset de fábrica enviado para a ONT" };
    }),

  // Diagnóstico de ping da ONT para um IP
  ping: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      host: z.string().default("8.8.8.8"),
      count: z.number().min(1).max(10).default(4),
    }))
    .mutation(async ({ input }) => {
      const encoded = encodeURIComponent(input.deviceId);

      await genieRequest(
        `/devices/${encoded}/tasks?connection_request`,
        "POST",
        {
          name: "setParameterValues",
          parameterValues: [
            ["InternetGatewayDevice.IPPingDiagnostics.Host", input.host, "xsd:string"],
            ["InternetGatewayDevice.IPPingDiagnostics.NumberOfRepetitions", String(input.count), "xsd:unsignedInt"],
            ["InternetGatewayDevice.IPPingDiagnostics.DiagnosticsState", "Requested", "xsd:string"],
          ]
        }
      );

      await new Promise(r => setTimeout(r, 3000));

      try {
        const devices = await genieRequest(
          `/devices/${encoded}?projection=${encodeURIComponent(
            "InternetGatewayDevice.IPPingDiagnostics"
          )}`
        );
        const device = Array.isArray(devices) ? devices[0] : devices;
        const diag = device?.["InternetGatewayDevice"]?.["IPPingDiagnostics"];

        return {
          success: true,
          host: input.host,
          successCount: parseInt(diag?.["SuccessCount"]?._value || "0"),
          failureCount: parseInt(diag?.["FailureCount"]?._value || "0"),
          avgResponseTime: parseInt(diag?.["AverageResponseTime"]?._value || "0"),
          minResponseTime: parseInt(diag?.["MinimumResponseTime"]?._value || "0"),
          maxResponseTime: parseInt(diag?.["MaximumResponseTime"]?._value || "0"),
          state: diag?.["DiagnosticsState"]?._value || "Unknown",
        };
      } catch {
        return {
          success: true,
          host: input.host,
          message: "Diagnóstico iniciado — aguarde o próximo inform da ONT para ver resultados",
        };
      }
    }),

  // Configurar ONT automaticamente via SGP (PPPoE + Wi-Fi)
  configureOnt: protectedProcedure
    .input(z.object({
      deviceId: z.string(),           // ID do dispositivo no GenieACS (serial)
      sgpOnuId: z.number().optional(), // ID da ONU no SGP (se já conhecido)
      serial: z.string().optional(),   // Serial da ONU para busca no SGP
      // Campos manuais (sobrepõem os do SGP)
      pppoeLogin: z.string().optional(),
      pppoePassword: z.string().optional(),
      wifiSsid: z.string().optional(),
      wifiPassword: z.string().optional(),
      wifiSsid5: z.string().optional(),
      wifiPassword5: z.string().optional(),
      // Opções de configuração
      configurePppoe: z.boolean().default(true),
      configureWifi: z.boolean().default(true),
      useGenieacs: z.boolean().default(true),  // true = via TR-069, false = via SGP API
    }))
    .mutation(async ({ input }) => {
      const results: string[] = [];
      const errors: string[] = [];

      // ─── 1. Buscar dados da ONU no SGP ───────────────────────────────────
      let sgpOnu: Awaited<ReturnType<typeof sgpGetOnuDetail>> = null;
      let pppoeLogin = input.pppoeLogin || "";
      let pppoePassword = input.pppoePassword || "";
      let wifiSsid = input.wifiSsid || "";
      let wifiPassword = input.wifiPassword || "";
      let wifiSsid5 = input.wifiSsid5 || "";
      let wifiPassword5 = input.wifiPassword5 || "";

      try {
        const sgpCfg = await getSgpConfig();
        if (sgpCfg) {
          // Buscar ONU pelo ID ou serial
          if (input.sgpOnuId) {
            sgpOnu = await sgpGetOnuDetail(sgpCfg, input.sgpOnuId);
          } else {
            // Extrair serial do deviceId GenieACS (formato: OUI-ProductClass-SerialNumber)
            const serial = input.serial || input.deviceId.split("-").slice(2).join("-") || input.deviceId;
            sgpOnu = await sgpGetOnuBySerial(sgpCfg, serial);
          }

          if (sgpOnu) {
            // Preencher campos do SGP se não fornecidos manualmente
            if (!pppoeLogin && sgpOnu.onu_login) pppoeLogin = sgpOnu.onu_login;
            if (!pppoePassword && sgpOnu.onu_password) pppoePassword = sgpOnu.onu_password;
            if (!wifiSsid && sgpOnu.wifi_ssid) wifiSsid = sgpOnu.wifi_ssid;
            if (!wifiPassword && sgpOnu.wifi_password) wifiPassword = sgpOnu.wifi_password;
            if (!wifiSsid5 && sgpOnu.wifi_ssid5) wifiSsid5 = sgpOnu.wifi_ssid5;
            if (!wifiPassword5 && sgpOnu.wifi_password5) wifiPassword5 = sgpOnu.wifi_password5;
            results.push(`ONU encontrada no SGP: ID ${sgpOnu.id} (${sgpOnu.onu_login || "sem login"})`);
          } else {
            results.push("ONU não encontrada no SGP — usando parâmetros manuais");
          }
        } else {
          results.push("SGP não configurado — usando parâmetros manuais");
        }
      } catch (err: any) {
        errors.push(`Erro ao consultar SGP: ${err.message}`);
      }

      // ─── 2. Configurar PPPoE ──────────────────────────────────────────────
      if (input.configurePppoe && pppoeLogin) {
        if (input.useGenieacs) {
          // Via TR-069 (GenieACS) — caminhos para TP-Link, Intelbras e VSOL
          try {
            const encoded = encodeURIComponent(input.deviceId);
            const parameterValues: Array<[string, string, string]> = [];

            // Caminhos PPPoE — compatíveis com TP-Link, Intelbras e VSOL
            const pppoeBasePaths = [
              "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1",
            ];

            for (const base of pppoeBasePaths) {
              parameterValues.push([`${base}.Username`, pppoeLogin, "xsd:string"]);
              if (pppoePassword) {
                parameterValues.push([`${base}.Password`, pppoePassword, "xsd:string"]);
              }
              parameterValues.push([`${base}.Enable`, "true", "xsd:boolean"]);
              parameterValues.push([`${base}.ConnectionType`, "IP_Routed", "xsd:string"]);
            }

            await genieRequest(
              `/devices/${encoded}/tasks?connection_request`,
              "POST",
              { name: "setParameterValues", parameterValues }
            );
            results.push(`PPPoE configurado via TR-069: ${pppoeLogin}`);
          } catch (err: any) {
            errors.push(`Erro ao configurar PPPoE via GenieACS: ${err.message}`);
          }
        } else if (sgpOnu) {
          // Via API do SGP
          try {
            const sgpCfg = await getSgpConfig();
            if (sgpCfg) {
              await sgpConfigureOnuWan(sgpCfg, sgpOnu.id, {
                onu_login: pppoeLogin,
                onu_password: pppoePassword,
              });
              results.push(`PPPoE configurado via SGP: ${pppoeLogin}`);
            }
          } catch (err: any) {
            errors.push(`Erro ao configurar PPPoE via SGP: ${err.message}`);
          }
        }
      } else if (input.configurePppoe && !pppoeLogin) {
        errors.push("Login PPPoE não disponível — verifique o cadastro no SGP");
      }

      // ─── 3. Configurar Wi-Fi ─────────────────────────────────────────────
      if (input.configureWifi && (wifiSsid || wifiPassword)) {
        if (input.useGenieacs) {
          // Via TR-069 (GenieACS)
          try {
            const parameterValues: Array<[string, string, string]> = [];
            const encoded = encodeURIComponent(input.deviceId);

            // 2.4GHz
            if (wifiSsid) {
              parameterValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", wifiSsid, "xsd:string"]);
            }
            if (wifiPassword) {
              parameterValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey", wifiPassword, "xsd:string"]);
              parameterValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", wifiPassword, "xsd:string"]);
            }
            // 5GHz
            if (wifiSsid5) {
              parameterValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID", wifiSsid5, "xsd:string"]);
            }
            if (wifiPassword5) {
              parameterValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.PreSharedKey", wifiPassword5, "xsd:string"]);
              parameterValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase", wifiPassword5, "xsd:string"]);
            }

            if (parameterValues.length > 0) {
              await genieRequest(
                `/devices/${encodeURIComponent(input.deviceId)}/tasks?connection_request`,
                "POST",
                { name: "setParameterValues", parameterValues }
              );
              results.push(`Wi-Fi configurado via TR-069: ${wifiSsid || "(sem SSID)"}`);
            }
          } catch (err: any) {
            errors.push(`Erro ao configurar Wi-Fi via GenieACS: ${err.message}`);
          }
        } else if (sgpOnu) {
          // Via API do SGP
          try {
            const sgpCfg = await getSgpConfig();
            if (sgpCfg) {
              await sgpConfigureOnuWifi(sgpCfg, sgpOnu.id, {
                wifi_ssid: wifiSsid || undefined,
                wifi_password: wifiPassword || undefined,
                wifi_ssid5: wifiSsid5 || undefined,
                wifi_password5: wifiPassword5 || undefined,
              });
              results.push(`Wi-Fi configurado via SGP: ${wifiSsid || "(sem SSID)"}`);
            }
          } catch (err: any) {
            errors.push(`Erro ao configurar Wi-Fi via SGP: ${err.message}`);
          }
        }
      }

      return {
        success: errors.length === 0,
        results,
        errors,
        sgpData: sgpOnu ? {
          id: sgpOnu.id,
          pppoeLogin: sgpOnu.onu_login || null,
          hasPppoePassword: !!(sgpOnu.onu_password),
          wifiSsid: sgpOnu.wifi_ssid || null,
          wifiSsid5: sgpOnu.wifi_ssid5 || null,
        } : null,
      };
    }),

  // Buscar dados da ONU no SGP pelo serial/deviceId
  getOnuFromSgp: protectedProcedure
    .input(z.object({
      deviceId: z.string(),
      serial: z.string().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const sgpCfg = await getSgpConfig();
        if (!sgpCfg) return { found: false, data: null, message: "SGP não configurado" };

        const serial = input.serial || input.deviceId.split("-").slice(2).join("-") || input.deviceId;
        const onu = await sgpGetOnuBySerial(sgpCfg, serial);

        if (!onu) return { found: false, data: null, message: "ONU não encontrada no SGP" };

        return {
          found: true,
          data: {
            id: onu.id,
            pppoeLogin: onu.onu_login || null,
            hasPppoePassword: !!(onu.onu_password),
            wifiSsid: onu.wifi_ssid || null,
            wifiSsid5: onu.wifi_ssid5 || null,
            address: onu.address || null,
            vlan: onu.vlan || null,
            olt: onu.olt_name || null,
            slot: onu.slot,
            pon: onu.pon,
          },
          message: "ONU encontrada",
        };
      } catch (err: any) {
        return { found: false, data: null, message: err.message };
      }
    }),

  // Forçar actualização de parâmetros (refresh)
  refreshDevice: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      const encoded = encodeURIComponent(input.deviceId);
      await genieRequest(
        `/devices/${encoded}/tasks?connection_request`,
        "POST",
        {
          name: "getParameterValues",
          parameterNames: [
            "InternetGatewayDevice.DeviceInfo.",
            "InternetGatewayDevice.WANDevice.1.",
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.",
          ]
        }
      );
      return { success: true, message: "Actualização de parâmetros solicitada" };
    }),
});
