const jwt = require("jsonwebtoken");
const sql = require("../config/db");

/**
 * Middleware de autenticação JWT
 * Extrai e verifica o token do header Authorization: Bearer <token>
 * Em caso de sucesso, anexa usuario_id e tipo_perfil ao req
 * Em caso de falha (token ausente, inválido ou expirado), retorna 401
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }

  const token = authHeader.slice(7);

  if (!token) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }

  try {
    // Check blacklist
    const revoked = await sql`SELECT token FROM revoked_tokens WHERE token = ${token}`;
    if (revoked.length > 0) {
      return res.status(401).json({ error: "Token revogado" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.usuario_id = decoded.id;
    req.tipo_perfil = decoded.tipo_perfil;
    req.token = token; // Anexamos o token para uso no logout

    return next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

module.exports = authMiddleware;
