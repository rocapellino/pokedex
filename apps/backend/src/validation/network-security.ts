// ==============================================================================
// Módulo de Seguridad de Red & Anti-SSRF (Pokédex API)
// ==============================================================================

const FORBIDDEN_TOKENS_PATTERN = /javascript:|onerror=|onload=|eval\(|<script/i;

export const SCRIPT_PATTERN = {
  test(val: unknown): boolean {
    if (typeof val !== 'string') return false;
    if (val.includes('<') && val.includes('>')) return true;
    return FORBIDDEN_TOKENS_PATTERN.test(val);
  },
};

/**
 * Determina si un hostname o dirección IP pertenece a rangos privados, loopback, link-local o IMDS (Anti-SSRF).
 */
export function isPrivateOrRestrictedIp(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').trim().toLowerCase();

  // 1. Cloud Metadata Hostnames
  if (host === 'metadata.google.internal' || host === 'metadata.internal' || host.endsWith('.internal')) {
    return true;
  }

  // 2. Loopback names
  if (host === 'localhost') {
    return true;
  }

  // 3. IPv4 check
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const o0 = Number(ipv4Match[1]);
    const o1 = Number(ipv4Match[2]);
    const o2 = Number(ipv4Match[3]);
    const o3 = Number(ipv4Match[4]);

    if (o0 > 255 || o1 > 255 || o2 > 255 || o3 > 255) {
      return true;
    }

    // 0.0.0.0/8 (Current network)
    if (o0 === 0) return true;
    // 10.0.0.0/8 (RFC 1918)
    if (o0 === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (o0 === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud IMDS)
    if (o0 === 169 && o1 === 254) return true;
    // 172.16.0.0/12 (RFC 1918)
    if (o0 === 172 && o1 >= 16 && o1 <= 31) return true;
    // 192.168.0.0/16 (RFC 1918)
    if (o0 === 192 && o1 === 168) return true;
    // 100.64.0.0/10 (CGNAT)
    if (o0 === 100 && o1 >= 64 && o1 <= 127) return true;
    // 224.0.0.0/4 and above (Multicast / Reserved)
    if (o0 >= 224) return true;
  }

  // 4. IPv6 check
  if (host.includes(':')) {
    if (host === '::1' || host === '0:0:0:0:0:0:0:1' || host === '::') return true;
    // Unique Local Addresses (fc00::/7)
    if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
    // Link-local unicast (fe80::/10)
    if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x)
    const v4Mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(host);
    if (v4Mapped) {
      return isPrivateOrRestrictedIp(v4Mapped[1]);
    }
  }

  return false;
}

/**
 * Validador estricto de URLs de imagen contra SSRF y pseudo-protocolos.
 *
 * MODELO DE AMENAZAS & LIMITACIÓN DE DNS REBINDING (SSRF):
 * 1. Consumo Actual (Solo Cliente):
 *    Actualmente el campo `imagen` únicamente se valida sintácticamente, se almacena en PostgreSQL
 *    y se envía en respuestas JSON para ser renderizado por el navegador del cliente (<img src>).
 *    El proceso Node.js NO realiza peticiones HTTP/HTTPS salientes para descargar ni procesar imágenes,
 *    por lo que no existe vector de SSRF server-side directo en la arquitectura vigente.
 * 2. Filtrado Sintáctico Estricto:
 *    Esta función valida el formato de URL (RFC 3986), exige HTTPS obligatorio (excepto localhost en dev),
 *    y rechaza literales de host que coincidan con localhost, rangos privados RFC 1918 (10.0.0.0/8,
 *    172.16.0.0/12, 192.168.0.0/16), Carrier-Grade NAT (100.64.0.0/10), IMDS de nube (169.254.169.254),
 *    bucle local IPv6 (::1, fe80::/10, fc00::/7) y representaciones IPv4-mapped (::ffff:x.x.x.x).
 * 3. DIRECTRIZ ARQUITECTÓNICA ANTE FETCH SERVER-SIDE FUTURO (DNS Rebinding / TOCTOU):
 *    Si en fases futuras se incorpora un servicio de thumbnailing, caching o fetch server-side de imágenes,
 *    NO debe confiarse exclusivamente en esta validación sintáctica debido al riesgo de DNS Rebinding
 *    (donde un dominio malicioso resuelve a una IP pública en el primer lookup y a una IP interna en la conexión).
 *    En tal escenario, la mitigación obligatoria debe implementarse a nivel de socket de red:
 *      - Configurar un agente HTTP/HTTPS personalizado (`http.Agent` / `undici.Dispatcher`) con hook
 *        de resolución DNS (`dns.promises.lookup()`).
 *      - Validar la dirección IP resuelta contra `isPrivateOrRestrictedIp()` inmediatamente antes de
 *        establecer el socket TCP, rechazando la conexión si apunta a una red privada o reservada.
 */
export function validateImageUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  const val = value.trim();

  if (val.startsWith('//')) {
    return false;
  }

  if (val.startsWith('/')) {
    return !SCRIPT_PATTERN.test(val);
  }

  try {
    const parsed = new URL(val);
    const host = parsed.hostname.toLowerCase();

    if (host === 'localhost' || host === '127.0.0.1') {
      if (parsed.protocol === 'http:') {
        return process.env.NODE_ENV !== 'production';
      }
      return parsed.protocol === 'https:';
    }

    // Protocolo externo debe ser HTTPS obligatorio
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Validación estricta contra SSRF en hostnames e IPs privadas
    if (isPrivateOrRestrictedIp(host)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
