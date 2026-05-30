const sql = require("../config/db");

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos em milissegundos

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
async function rateLimitMiddleware(req, res, next) {
  try {
    const ip = getClientIp(req);
    const now = Date.now();
    
    // Limpeza passiva de registros expirados
    await sql`DELETE FROM login_attempts WHERE first_attempt < ${now - WINDOW_MS}`;

    const rows = await sql`SELECT attempts, first_attempt FROM login_attempts WHERE ip = ${ip}`;
    
    if (rows.length === 0) {
      return next();
    }

    const record = rows[0];

    // Se atingiu o limite de tentativas dentro da janela, bloqueia
    if (record.attempts >= MAX_ATTEMPTS) {
      const elapsedMs = now - Number(record.first_attempt);
      const remainingMs = WINDOW_MS - elapsedMs;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const remainingMinutes = Math.ceil(remainingMs / 60000);

      return res.status(429).json({
        error: `Muitas tentativas de login. Tente novamente em ${remainingMinutes} minutos.`,
        retry_after: remainingSeconds
      });
    }

    return next();
  } catch (error) {
    console.error("Erro no rateLimitMiddleware:", error);
    // Em caso de erro no banco, permite a requisição para não bloquear o usuário por falha interna
    return next();
  }
}

/**
 * Registra uma tentativa de login falhada para o IP fornecido.
 * @param {string} ip - Endereço IP do cliente
 */
async function recordFailedAttempt(ip) {
  try {
    const now = Date.now();
    const rows = await sql`SELECT attempts FROM login_attempts WHERE ip = ${ip}`;
    
    if (rows.length === 0) {
      await sql`INSERT INTO login_attempts (ip, attempts, first_attempt) VALUES (${ip}, 1, ${now})`;
    } else {
      await sql`UPDATE login_attempts SET attempts = attempts + 1 WHERE ip = ${ip}`;
    }
  } catch (error) {
    console.error("Erro ao registrar tentativa falha de login:", error);
  }
}

/**
 * Limpa o registro de tentativas para um IP
 * @param {string} ip - Endereço IP do cliente
 */
async function resetAttempts(ip) {
  try {
    await sql`DELETE FROM login_attempts WHERE ip = ${ip}`;
  } catch (error) {
    console.error("Erro ao limpar tentativas de login:", error);
  }
}

module.exports = {
  rateLimitMiddleware,
  recordFailedAttempt,
  resetAttempts,
  getClientIp
};
