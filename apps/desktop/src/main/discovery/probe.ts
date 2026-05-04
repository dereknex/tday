/**
 * Core probe logic: given a host + ServiceSpec, try to reach the service
 * and optionally enumerate its models.
 *
 * Deliberately has no Electron / Node built-in dependencies beyond `node:net`
 * and `node:http` so it is easy to unit-test in isolation.
 */

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createConnection } from 'node:net';
import type { DiscoveredService, ServiceSpec } from './types.js';

/** TCP connect timeout in ms — used as a fast pre-filter before HTTP. */
const TCP_TIMEOUT_MS = 400;

/**
 * Try to open a TCP socket to `host:port`.
 * Returns `true` if the port is open (connection established), `false` on
 * timeout / ECONNREFUSED / any error.
 */
export function tcpProbe(host: string, port: number, timeoutMs = TCP_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, timeoutMs);
    sock.on('connect', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

interface HttpGetResult {
  ok: boolean;
  status: number;
  body: string;
  latencyMs: number;
}

/**
 * Minimal HTTP/HTTPS GET with timeout.
 * Does NOT follow redirects — local services should answer directly.
 */
export function httpGet(url: string, timeoutMs = 2_000): Promise<HttpGetResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const req = (isHttps ? httpsRequest : httpRequest)(
      {
        hostname: u.hostname,
        port: u.port ? Number(u.port) : isHttps ? 443 : 80,
        path: u.pathname + u.search,
        method: 'GET',
        timeout: timeoutMs,
        headers: { accept: 'application/json' },
        // Self-signed certs are fine for local services
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({
            ok: (res.statusCode ?? 0) < 400,
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            latencyMs: Date.now() - t0,
          });
        });
        res.on('error', () =>
          resolve({ ok: false, status: 0, body: '', latencyMs: Date.now() - t0 }),
        );
      },
    );
    req.on('error', () =>
      resolve({ ok: false, status: 0, body: '', latencyMs: Date.now() - t0 }),
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: '', latencyMs: Date.now() - t0 });
    });
    req.end();
  });
}

/**
 * Parse a model-listing JSON response.
 *
 * Supported shapes:
 *   Ollama:  { "models": [ { "name": "llama3:8b", ... }, ... ] }
 *   OpenAI:  { "data":   [ { "id": "gpt-4", ... }, ... ] }
 *   vLLM:    same as OpenAI
 *   LM Studio: same as OpenAI
 */
export function parseModelList(body: string): string[] {
  try {
    const json = JSON.parse(body) as unknown;
    if (typeof json !== 'object' || json === null) return [];
    const obj = json as Record<string, unknown>;

    // Ollama: models[].name
    if (Array.isArray(obj['models'])) {
      return (obj['models'] as Array<Record<string, unknown>>)
        .map((m) => String(m['name'] ?? m['id'] ?? ''))
        .filter(Boolean);
    }
    // OpenAI-compat: data[].id
    if (Array.isArray(obj['data'])) {
      return (obj['data'] as Array<Record<string, unknown>>)
        .map((m) => String(m['id'] ?? m['name'] ?? ''))
        .filter(Boolean);
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

/**
 * Probe a single `host:port` for a given `spec`.
 *
 * Returns `null` if the service is not reachable, otherwise a
 * `DiscoveredService` with as much info as we could collect.
 */
export async function probeService(
  host: string,
  port: number,
  spec: ServiceSpec,
  tcpTimeoutMs = TCP_TIMEOUT_MS,
): Promise<DiscoveredService | null> {
  // Fast TCP pre-filter
  const open = await tcpProbe(host, port, tcpTimeoutMs);
  if (!open) return null;

  const baseUrl = `http://${host}:${port}${spec.baseSuffix}`;
  const rawBase = `http://${host}:${port}`;

  // Health check
  const health = await httpGet(rawBase + spec.healthPath, 2_000);
  if (!health.ok) {
    // Try the models path as fallback health check (some services only expose that)
    if (spec.modelsPath) {
      const fallback = await httpGet(rawBase + spec.modelsPath, 2_000);
      if (!fallback.ok) return null;
    } else {
      return null;
    }
  }

  // Model listing
  let models: string[] = [];
  if (spec.modelsPath) {
    const modelsRes = await httpGet(rawBase + spec.modelsPath, 2_000);
    if (modelsRes.ok) {
      models = parseModelList(modelsRes.body);
    }
  }

  return {
    kind: spec.kind,
    label: spec.label,
    baseUrl,
    models,
    latencyMs: health.latencyMs,
  };
}

/**
 * Probe an arbitrary base URL (e.g. `http://localhost:1234/v1`) for models.
 *
 * Strategy:
 *   1. TCP probe the host:port first — if the port is closed it's truly unreachable.
 *   2. If TCP succeeds the service IS running; attempt HTTP model enumeration.
 *   3. Any HTTP response (even 4xx) confirms reachability.
 */
export async function probeBaseUrl(
  rawUrl: string,
  timeoutMs = 5_000,
): Promise<{ ok: boolean; models: string[]; latencyMs: number; error?: string }> {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return { ok: false, models: [], latencyMs: 0, error: 'Invalid URL' };
  }

  const host = u.hostname;
  const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);

  // ── Step 1: TCP reachability (works for localhost AND LAN IPs) ──────────────
  const t0 = Date.now();
  const tcpOpen = await tcpProbe(host, port, Math.min(timeoutMs, 2_000));
  if (!tcpOpen) {
    return { ok: false, models: [], latencyMs: 0, error: 'Not reachable' };
  }
  const tcpLatency = Date.now() - t0;

  // ── Step 2: HTTP model enumeration (best-effort) ───────────────────────────
  const base = rawUrl.trim().replace(/\/$/, '');
  const candidates: string[] = [];
  candidates.push(base + '/models');
  if (!/\/v\d+$/.test(base)) candidates.push(base + '/v1/models');
  // Ollama: strip possible /v1 suffix and probe /api/tags
  const ollamaBase = base.replace(/\/v\d+$/, '');
  candidates.push(ollamaBase + '/api/tags');

  for (const url of candidates) {
    const result = await httpGet(url, timeoutMs);
    if (result.ok) {
      const models = parseModelList(result.body);
      return { ok: true, models, latencyMs: result.latencyMs };
    }
    if (result.status > 0) {
      // Got an HTTP response (4xx / 5xx) — service is running
      return { ok: true, models: [], latencyMs: result.latencyMs };
    }
  }

  // TCP was open but all HTTP attempts failed — still reachable
  return { ok: true, models: [], latencyMs: tcpLatency };
}
