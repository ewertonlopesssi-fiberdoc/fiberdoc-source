-- =============================================================================
--  FiberDoc v8.0 — Migração Incremental
--  Novas tabelas: Monitor de Rede SNMP (network_snmp_config, network_snmp_ports,
--                 network_snmp_readings, network_port_readings, network_snmp_alerts)
--  Novos campos:  network_snmp_ports.alertBpsMax
--  Enum atualizado: network_snmp_alerts.net_alert_type (+ traffic_high)
--
--  Execute este script UMA VEZ na base de dados de produção:
--    mysql -u USER -p DBNAME < migrate-v8.sql
--
--  O script é idempotente: usa CREATE TABLE IF NOT EXISTS e ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- ── 1. Tabela network_snmp_config ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `network_snmp_config` (
  `id`                    int AUTO_INCREMENT NOT NULL,
  `equipmentId`           int NOT NULL,
  `enabled`               boolean NOT NULL DEFAULT false,
  `snmpHost`              varchar(128),
  `snmpPort`              int DEFAULT 161,
  `net_snmp_version`      enum('v1','v2c','v3') DEFAULT 'v2c',
  `snmpCommunity`         varchar(128),
  `snmpV3User`            varchar(128),
  `net_snmpv3_auth_proto` enum('MD5','SHA'),
  `snmpV3AuthKey`         varchar(255),
  `net_snmpv3_priv_proto` enum('DES','AES'),
  `snmpV3PrivKey`         varchar(255),
  `pollInterval`          int DEFAULT 300,
  `alertsEnabled`         boolean NOT NULL DEFAULT false,
  `alertCpuMax`           float,
  `alertMemMax`           float,
  `alertTempMax`          float,
  `lastPollAt`            timestamp NULL,
  `lastPollError`         text,
  `lastCpuPercent`        float,
  `lastMemPercent`        float,
  `lastTemperature`       float,
  `lastUptimeSeconds`     int,
  `lastPortCount`         int,
  `net_snmp_created_at`   timestamp NOT NULL DEFAULT (now()),
  `net_snmp_updated_at`   timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `network_snmp_config_id` PRIMARY KEY(`id`),
  CONSTRAINT `network_snmp_config_equipmentId_unique` UNIQUE(`equipmentId`),
  CONSTRAINT `network_snmp_config_equipmentId_fk`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE CASCADE
);

-- ── 2. Tabela network_snmp_ports ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `network_snmp_ports` (
  `id`                    int AUTO_INCREMENT NOT NULL,
  `equipmentId`           int NOT NULL,
  `ifIndex`               int NOT NULL,
  `ifName`                varchar(64),
  `ifAlias`               varchar(128),
  `ifSpeed`               int,
  `ifType`                varchar(32),
  `if_oper_status`        enum('up','down','testing','unknown','dormant','notPresent','lowerLayerDown') DEFAULT 'unknown',
  `if_admin_status`       enum('up','down','testing') DEFAULT 'up',
  `lastInBps`             float,
  `lastOutBps`            float,
  `lastInOctets`          int,
  `lastOutOctets`         int,
  `gbicEnabled`           boolean NOT NULL DEFAULT false,
  `lastRxPowerDbm`        float,
  `lastTxPowerDbm`        float,
  `lastGbicTemp`          float,
  `lastGbicVoltage`       float,
  `alertRxMin`            float,
  `alertRxMax`            float,
  `alertBpsMax`           float,
  `net_port_last_poll_at` timestamp NULL,
  `net_port_created_at`   timestamp NOT NULL DEFAULT (now()),
  `net_port_updated_at`   timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `network_snmp_ports_id` PRIMARY KEY(`id`),
  CONSTRAINT `network_snmp_ports_equipmentId_fk`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE CASCADE
);

-- ── 3. Tabela network_snmp_readings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `network_snmp_readings` (
  `id`                        int AUTO_INCREMENT NOT NULL,
  `equipmentId`               int NOT NULL,
  `cpuPercent`                float,
  `memPercent`                float,
  `temperature`               float,
  `uptimeSeconds`             int,
  `net_reading_collected_at`  timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `network_snmp_readings_id` PRIMARY KEY(`id`),
  CONSTRAINT `network_snmp_readings_equipmentId_fk`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE CASCADE
);

-- ── 4. Tabela network_port_readings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `network_port_readings` (
  `id`                    int AUTO_INCREMENT NOT NULL,
  `portId`                int NOT NULL,
  `inBps`                 float,
  `outBps`                float,
  `inOctets`              int,
  `outOctets`             int,
  `operStatus`            varchar(32),
  `rxPowerDbm`            float,
  `txPowerDbm`            float,
  `gbicTemp`              float,
  `net_port_reading_at`   timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `network_port_readings_id` PRIMARY KEY(`id`),
  CONSTRAINT `network_port_readings_portId_fk`
    FOREIGN KEY (`portId`) REFERENCES `network_snmp_ports`(`id`) ON DELETE CASCADE
);

-- ── 5. Tabela network_snmp_alerts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `network_snmp_alerts` (
  `id`                      int AUTO_INCREMENT NOT NULL,
  `equipmentId`             int NOT NULL,
  `portId`                  int,
  `net_alert_type`          enum('cpu_high','mem_high','temp_high','port_down','port_up',
                                 'rx_power_low','rx_power_high','tx_power_low','tx_power_high',
                                 'snmp_unreachable','traffic_high') NOT NULL,
  `net_alert_severity`      enum('info','warning','critical') NOT NULL DEFAULT 'warning',
  `message`                 text NOT NULL,
  `currentValue`            float,
  `thresholdValue`          float,
  `net_alert_ack_at`        timestamp NULL,
  `acknowledgedBy`          varchar(128),
  `net_alert_resolved_at`   timestamp NULL,
  `net_alert_created_at`    timestamp NOT NULL DEFAULT (now()),
  `net_alert_updated_at`    timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `network_snmp_alerts_id` PRIMARY KEY(`id`),
  CONSTRAINT `network_snmp_alerts_equipmentId_fk`
    FOREIGN KEY (`equipmentId`) REFERENCES `equipments`(`id`) ON DELETE CASCADE,
  CONSTRAINT `network_snmp_alerts_portId_fk`
    FOREIGN KEY (`portId`) REFERENCES `network_snmp_ports`(`id`) ON DELETE CASCADE
);

-- ── 6. Adicionar alertBpsMax se tabela já existia sem esse campo ──────────────
-- (seguro executar mesmo se a coluna já existir — MySQL ignora se usar IF NOT EXISTS)
ALTER TABLE `network_snmp_ports`
  ADD COLUMN IF NOT EXISTS `alertBpsMax` float AFTER `alertRxMax`;

-- ── 7. Atualizar enum de alertas para incluir traffic_high ───────────────────
-- (idempotente: MODIFY COLUMN é seguro se o valor já existir)
ALTER TABLE `network_snmp_alerts`
  MODIFY COLUMN `net_alert_type`
    enum('cpu_high','mem_high','temp_high','port_down','port_up',
         'rx_power_low','rx_power_high','tx_power_low','tx_power_high',
         'snmp_unreachable','traffic_high') NOT NULL;

-- ── Fim da migração v8.0 ─────────────────────────────────────────────────────
