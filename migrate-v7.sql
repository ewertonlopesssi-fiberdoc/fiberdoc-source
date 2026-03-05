-- =============================================================================
--  FiberDoc v7.0 — Migração Incremental
--  Novas tabelas: SSH Commander (dispositivos, comandos rápidos, execuções, BGP peers)
--
--  Execute este script UMA VEZ na base de dados de produção:
--    mysql -u USER -p DBNAME < migrate-v7.sql
--
--  O script é idempotente: verifica a existência das tabelas antes de criar.
-- =============================================================================

-- ── 1. Tabela ssh_devices ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ssh_devices` (
  `id`                      int AUTO_INCREMENT NOT NULL,
  `name`                    varchar(100) NOT NULL,
  `host`                    varchar(255) NOT NULL,
  `port`                    int NOT NULL DEFAULT 22,
  `username`                varchar(100) NOT NULL,
  `ssh_auth_type`           enum('password','key') NOT NULL DEFAULT 'password',
  `password`                text,
  `private_key`             text,
  `device_type`             varchar(50) DEFAULT 'generic',
  `notes`                   text,
  `ssh_device_created_at`   timestamp NOT NULL DEFAULT (now()),
  `ssh_device_updated_at`   timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ssh_devices_id` PRIMARY KEY(`id`)
);

-- ── 2. Tabela ssh_quick_commands ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ssh_quick_commands` (
  `id`                  int AUTO_INCREMENT NOT NULL,
  `name`                varchar(100) NOT NULL,
  `description`         text,
  `command`             text NOT NULL,
  `category`            varchar(50) DEFAULT 'diagnostico',
  `device_type`         varchar(50) DEFAULT 'generic',
  `is_dangerous`        int DEFAULT 0,
  `color`               varchar(20) DEFAULT '#3B82F6',
  `ssh_qcmd_created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `ssh_quick_commands_id` PRIMARY KEY(`id`)
);

-- ── 3. Tabela ssh_executions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ssh_executions` (
  `id`                  int AUTO_INCREMENT NOT NULL,
  `device_id`           int NOT NULL,
  `command_name`        varchar(100),
  `command_text`        text NOT NULL,
  `output`              text,
  `ssh_exec_status`     enum('success','error','timeout') DEFAULT 'success',
  `duration_ms`         int,
  `executed_by`         int,
  `ssh_executed_at`     timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `ssh_executions_id` PRIMARY KEY(`id`)
);

-- ── 4. Tabela bgp_peers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `bgp_peers` (
  `id`                    int AUTO_INCREMENT NOT NULL,
  `device_id`             int NOT NULL,
  `peer_ip`               varchar(45) NOT NULL,
  `remote_as`             int NOT NULL,
  `description`           varchar(200),
  `bgp_peer_type`         enum('ebgp','ibgp') DEFAULT 'ebgp',
  `local_as`              int,
  `activate_script`       text,
  `deactivate_script`     text,
  `notes`                 text,
  `bgp_peer_created_at`   timestamp NOT NULL DEFAULT (now()),
  `bgp_peer_updated_at`   timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `bgp_peers_id` PRIMARY KEY(`id`)
);

-- ── Fim da migração v7.0 ─────────────────────────────────────────────────────
