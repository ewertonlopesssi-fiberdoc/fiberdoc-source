/**
 * sslManager.ts
 * Gerencia a configuração automática de domínio + SSL Let's Encrypt via Certbot + Nginx.
 *
 * Fluxo:
 *  1. Recebe domínio e e-mail do admin
 *  2. Grava configuração Nginx temporária com server_name correto (HTTP only) para validação ACME
 *  3. Executa certbot --nginx para obter/renovar certificado
 *  4. Grava configuração Nginx final com SSL (Let's Encrypt)
 *  5. Recarrega Nginx
 *  6. Salva domínio em system_settings (serverPublicUrl)
 */

import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

export interface SslStatus {
  running: boolean;
  progress: number;
  step: string;
  log: string[];
  error?: string;
  success?: boolean;
  domain?: string;
}

let sslStatus: SslStatus = {
  running: false,
  progress: 0,
  step: "idle",
  log: [],
};

export function getSslStatus(): SslStatus {
  return { ...sslStatus, log: [...sslStatus.log] };
}

function setStatus(progress: number, step: string, logLine?: string) {
  sslStatus.progress = progress;
  sslStatus.step = step;
  if (logLine) {
    const ts = new Date().toLocaleTimeString("pt-BR");
    sslStatus.log.push(`[${ts}] ${logLine}`);
  }
}

// Caminho do arquivo de configuração Nginx do FiberDoc
const NGINX_CONF_PATH = "/etc/nginx/sites-enabled/fiberdoc";
const NGINX_CONF_AVAILABLE = "/etc/nginx/sites-available/fiberdoc";

function writeNginxConf(domain: string, useSSL: boolean, certPath?: string, keyPath?: string) {
  let conf: string;

  if (useSSL && certPath && keyPath) {
    conf = `# Configuração gerada automaticamente pelo FiberDoc
# Redireciona HTTP para HTTPS
server {
    listen 80;
    server_name ${domain};
    return 301 https://$host$request_uri;
}

# HTTPS com certificado Let's Encrypt
server {
    listen 443 ssl;
    server_name ${domain};

    ssl_certificate     ${certPath};
    ssl_certificate_key ${keyPath};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    proxy_read_timeout  120s;
    proxy_send_timeout  120s;
    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
  } else {
    // Configuração temporária HTTP apenas para validação ACME
    conf = `# Configuração temporária para validação Let's Encrypt
server {
    listen 80;
    server_name ${domain};

    proxy_read_timeout  120s;
    proxy_send_timeout  120s;
    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto http;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
  }

  // Escrever em sites-available e criar symlink em sites-enabled
  fs.writeFileSync(NGINX_CONF_AVAILABLE, conf, "utf-8");
  if (!fs.existsSync(NGINX_CONF_PATH)) {
    try {
      execSync(`ln -sf ${NGINX_CONF_AVAILABLE} ${NGINX_CONF_PATH}`);
    } catch {
      // Se já existe como arquivo regular, sobrescrever
      fs.writeFileSync(NGINX_CONF_PATH, conf, "utf-8");
    }
  } else {
    // Sobrescrever diretamente se já existe
    fs.writeFileSync(NGINX_CONF_PATH, conf, "utf-8");
  }
}

function reloadNginx(): boolean {
  try {
    execSync("nginx -t 2>&1", { timeout: 10000 });
    execSync("systemctl reload nginx 2>&1", { timeout: 10000 });
    return true;
  } catch (e: any) {
    throw new Error(`Falha ao recarregar Nginx: ${e.message}`);
  }
}

function certbotExists(): boolean {
  try {
    execSync("which certbot", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function nginxExists(): boolean {
  try {
    execSync("which nginx", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function certificateExists(domain: string): boolean {
  const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
  return fs.existsSync(certPath);
}

export async function configureDomainSsl(domain: string, email: string): Promise<void> {
  if (sslStatus.running) {
    throw new Error("Configuração SSL já está em andamento.");
  }

  // Validação básica do domínio
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain)) {
    throw new Error("Domínio inválido. Use o formato: exemplo.com.br");
  }

  sslStatus = {
    running: true,
    progress: 0,
    step: "iniciando",
    log: [],
    domain,
  };

  // Executar de forma assíncrona para não bloquear a resposta HTTP
  setImmediate(async () => {
    try {
      setStatus(5, "verificando", "Verificando dependências (nginx, certbot)...");

      if (!nginxExists()) {
        throw new Error("Nginx não encontrado. Instale com: apt install nginx");
      }
      setStatus(10, "verificando", "✓ Nginx encontrado.");

      if (!certbotExists()) {
        setStatus(12, "instalando-certbot", "Certbot não encontrado. Instalando...");
        execSync("apt-get install -y certbot python3-certbot-nginx 2>&1", { timeout: 120000 });
        setStatus(20, "instalando-certbot", "✓ Certbot instalado.");
      } else {
        setStatus(20, "verificando", "✓ Certbot encontrado.");
      }

      setStatus(25, "nginx-temp", `Configurando Nginx para o domínio ${domain}...`);
      writeNginxConf(domain, false);
      reloadNginx();
      setStatus(35, "nginx-temp", "✓ Nginx configurado com domínio.");

      const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
      const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;

      if (certificateExists(domain)) {
        setStatus(40, "cert-exists", `Certificado para ${domain} já existe. Renovando se necessário...`);
        try {
          execSync(`certbot renew --cert-name ${domain} --non-interactive 2>&1`, { timeout: 120000 });
          setStatus(70, "cert-renewed", "✓ Certificado verificado/renovado.");
        } catch {
          setStatus(70, "cert-exists", "✓ Certificado existente ainda válido.");
        }
      } else {
        setStatus(40, "certbot", `Solicitando certificado Let's Encrypt para ${domain}...`);
        setStatus(45, "certbot", "Isso pode levar até 2 minutos...");

        try {
          const certbotCmd = [
            "certbot", "certonly",
            "--nginx",
            "-d", domain,
            "--non-interactive",
            "--agree-tos",
            "--email", email,
            "--redirect",
          ].join(" ");

          execSync(`${certbotCmd} 2>&1`, { timeout: 180000 });
          setStatus(70, "certbot", "✓ Certificado Let's Encrypt obtido com sucesso!");
        } catch (certErr: any) {
          // Tentar método webroot como fallback
          setStatus(50, "certbot-webroot", "Tentando método alternativo (webroot)...");
          try {
            const webrootCmd = [
              "certbot", "certonly",
              "--webroot",
              "-w", "/var/www/html",
              "-d", domain,
              "--non-interactive",
              "--agree-tos",
              "--email", email,
            ].join(" ");
            execSync(`${webrootCmd} 2>&1`, { timeout: 180000 });
            setStatus(70, "certbot-webroot", "✓ Certificado obtido via webroot.");
          } catch (webErr: any) {
            throw new Error(
              `Falha ao obter certificado. Verifique se o domínio ${domain} aponta para este servidor e se a porta 80 está acessível.\n` +
              `Erro: ${certErr.message}`
            );
          }
        }
      }

      setStatus(80, "nginx-ssl", "Configurando Nginx com SSL...");
      writeNginxConf(domain, true, certPath, keyPath);
      reloadNginx();
      setStatus(90, "nginx-ssl", "✓ Nginx configurado com SSL Let's Encrypt.");

      // Salvar domínio nas configurações do sistema
      setStatus(95, "salvando", "Salvando configurações...");
      try {
        const { getDb } = await import("./db");
        const { systemSettings } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (db) {
          const publicUrl = `https://${domain}`;
          const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, "serverPublicUrl")).limit(1);
          if (existing.length > 0) {
            await db.update(systemSettings).set({ value: publicUrl }).where(eq(systemSettings.key, "serverPublicUrl"));
          } else {
            await db.insert(systemSettings).values({ key: "serverPublicUrl", value: publicUrl });
          }
        }
      } catch (dbErr: any) {
        setStatus(95, "salvando", `Aviso: não foi possível salvar URL nas configurações: ${dbErr.message}`);
      }

      setStatus(100, "concluido", `✅ Domínio ${domain} configurado com SSL com sucesso!`);
      setStatus(100, "concluido", `🔒 Acesse: https://${domain}`);

      sslStatus.running = false;
      sslStatus.success = true;

    } catch (err: any) {
      const msg = err?.message ?? String(err);
      sslStatus.running = false;
      sslStatus.error = msg;
      sslStatus.step = "erro";
      sslStatus.log.push(`[${new Date().toLocaleTimeString("pt-BR")}] ❌ Erro: ${msg}`);
    }
  });
}
