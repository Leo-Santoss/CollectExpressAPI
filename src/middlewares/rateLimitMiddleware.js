/**
 * Middleware de rate limiting para login
 * Rastreia tentativas de login falhadas por IP usando um Map em memória.
 *
 * Regras:
 *   - Bloqueia após 5 tentativas falhadas dentro de uma janela de 15 minutos
 *   - Retorna 429 com informação de retry-after quando bloqueado
 *   - Exporta recordFailedAttempt(ip) para o controller registrar falhas
 *   - Limpeza automática de entradas expiradas para evitar vazamento de memória
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos em milissegundos
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Limpeza a cada 5 minutos

// Armazena tentativas por IP: { attempts: number, firstAttempt: number }
const attempts = new Map();

/**
 * Limpa entradas expiradas do Map para evitar vazamento de memória
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [ip, record] of attempts.entries()) {
    if (now - record.firstAttempt >= WINDOW_MS) {
      attempts.delete(ip);
    }
  }
}

// Inicia limpeza periódica
const cleanupTimer = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
// Permite que o processo encerre sem esperar o timer
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * Obtém o IP do request
 * @param {object} req - Express request
 * @returns {string} IP do cliente
 */
function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Middleware que verifica se o IP está bloqueado por excesso de tentativas
 */
function rateLimitMiddleware(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = attempts.get(ip);

  // Se não há registro para este IP, permite a requisição
  if (!record) {
    return next();
  }

  // Se a janela expirou, limpa o registro e permite
  if (now - record.firstAttempt >= WINDOW_MS) {
    attempts.delete(ip);
    return next();
  }

  // Se atingiu o limite de tentativas dentro da janela, bloqueia
  if (record.attempts >= MAX_ATTEMPTS) {
    const elapsedMs = now - record.firstAttempt;
    const remainingMs = WINDOW_MS - elapsedMs;
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const remainingMinutes = Math.ceil(remainingMs / 60000);

    return res.status(429).json({
      error: `Muitas tentativas de login. Tente novamente em ${remainingMinutes} minutos.`,
      retry_after: remainingSeconds
    });
  }

  // Ainda não atingiu o limite, permite a requisição
  return next();
}

/**
 * Registra uma tentativa de login falhada para o IP fornecido.
 * Deve ser chamada pelo controller de login quando a autenticação falha.
 * @param {string} ip - Endereço IP do cliente
 */
function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record || now - record.firstAttempt >= WINDOW_MS) {
    // Primeira tentativa ou janela expirada: inicia novo registro
    attempts.set(ip, { attempts: 1, firstAttempt: now });
  } else {
    // Incrementa tentativas dentro da janela ativa
    record.attempts += 1;
  }
}

/**
 * Limpa o registro de tentativas para um IP (ex: após login bem-sucedido)
 * @param {string} ip - Endereço IP do cliente
 */
function resetAttempts(ip) {
  attempts.delete(ip);
}

// Exporta para uso em testes (acesso ao Map interno)
rateLimitMiddleware._attempts = attempts;
rateLimitMiddleware._cleanupExpiredEntries = cleanupExpiredEntries;

module.exports = {
  rateLimitMiddleware,
  recordFailedAttempt,
  resetAttempts,
  getClientIp
};
