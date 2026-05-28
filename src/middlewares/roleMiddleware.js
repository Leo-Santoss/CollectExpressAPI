/**
 * Middleware factory para controle de acesso baseado em perfil (role).
 * Deve ser usado APÓS o authMiddleware, que já define req.tipo_perfil.
 *
 * @param {string[]} allowedRoles - Array de perfis permitidos (ex: ['CACAMBEIRO'], ['ADMIN'])
 * @returns {Function} Express middleware
 */
function roleMiddleware(allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.tipo_perfil)) {
      return res.status(403).json({ error: "Acesso não autorizado" });
    }
    return next();
  };
}

module.exports = roleMiddleware;
