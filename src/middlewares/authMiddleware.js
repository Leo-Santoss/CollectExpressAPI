const jwt = require("jsonwebtoken");

/**
 * Middleware de autenticação JWT
 * Extrai e verifica o token do header Authorization: Bearer <token>
 * Em caso de sucesso, anexa usuario_id e tipo_perfil ao req
 * Em caso de falha (token ausente, inválido ou expirado), retorna 401
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }

  const token = authHeader.slice(7);

  if (!token) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.usuario_id = decoded.id;
    req.tipo_perfil = decoded.tipo_perfil;

    return next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

module.exports = authMiddleware;
