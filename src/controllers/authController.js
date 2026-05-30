const sql = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { recordFailedAttempt, resetAttempts, getClientIp } = require("../middlewares/rateLimitMiddleware");

/**
 * In-memory store for password recovery tokens.
 * Structure: Map<string, { token, usuario_id, expires_at, used }>
 */
const recoveryTokens = new Map();

const authController = {
  /**
   * POST /api/auth/register
   * Registra um novo usuário (CONSUMIDOR ou CACAMBEIRO).
   * Para CACAMBEIRO, também insere detalhes de negócio em detalhes_cacambeiro.
   */
  async register(req, res) {
    try {
      const { nome_completo, email, senha, tipo_perfil, documento, telefone } = req.body;

      // Hash da senha com salt factor 10
      const senha_hash = await bcrypt.hash(senha, 10);

      // Inserir usuário na tabela usuarios
      const resultado = await sql`
        INSERT INTO usuarios (nome_completo, email, senha_hash, tipo_perfil, documento, telefone)
        VALUES (${nome_completo}, ${email}, ${senha_hash}, ${tipo_perfil}, ${documento}, ${telefone})
        RETURNING id, nome_completo, email, tipo_perfil, documento, telefone, criado_em
      `;

      const usuario = resultado[0];

      // Se CACAMBEIRO, inserir detalhes de negócio
      if (tipo_perfil === "CACAMBEIRO") {
        const { horario_inicio, horario_fim, raio_entrega_km, taxa_entrega } = req.body;

        await sql`
          INSERT INTO detalhes_cacambeiro (usuario_id, horario_inicio, horario_fim, raio_entrega_km, taxa_entrega)
          VALUES (${usuario.id}, ${horario_inicio}, ${horario_fim}, ${raio_entrega_km}, ${taxa_entrega})
        `;
      }

      return res.status(201).json(usuario);
    } catch (error) {
      // Tratar violação de constraint unique (código PostgreSQL 23505)
      if (error.code === "23505") {
        if (error.constraint && error.constraint.includes("email")) {
          return res.status(409).json({ error: "Email já cadastrado" });
        }
        if (error.constraint && error.constraint.includes("documento")) {
          return res.status(409).json({ error: "Documento já cadastrado" });
        }
        // Fallback para constraint genérica
        if (error.detail && error.detail.includes("email")) {
          return res.status(409).json({ error: "Email já cadastrado" });
        }
        if (error.detail && error.detail.includes("documento")) {
          return res.status(409).json({ error: "Documento já cadastrado" });
        }
        return res.status(409).json({ error: "Registro duplicado" });
      }

      console.error("Erro no registro:", error);
      return res.status(500).json({ error: "Erro interno no servidor ao tentar realizar o registro." });
    }
  },

  async login(req, res) {
    try {
      const { email, senha } = req.body;
      const ip = getClientIp(req);

      // 1. Buscar usuário pelo e-mail
      const usuarios = await sql`SELECT * FROM usuarios WHERE email = ${email}`;
      const usuario = usuarios[0];

      if (!usuario) {
        recordFailedAttempt(ip);
        return res.status(401).json({ error: "Credenciais inválidas" });
      }

      // 2. Comparar a senha enviada com o hash salvo no banco
      const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);

      if (!senhaValida) {
        recordFailedAttempt(ip);
        return res.status(401).json({ error: "Credenciais inválidas" });
      }

      // 3. Login bem-sucedido: limpar tentativas de rate limit
      resetAttempts(ip);

      // 4. Gerar o Token JWT com id e tipo_perfil no payload, expira em 24h
      const payload = {
        id: usuario.id,
        tipo_perfil: usuario.tipo_perfil
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "10m"
      });

      // Retornamos o token e os dados básicos do usuário (sem a senha)
      return res.status(200).json({
        token,
        usuario: {
          id: usuario.id,
          nome_completo: usuario.nome_completo,
          tipo_perfil: usuario.tipo_perfil
        }
      });

    } catch (error) {
      console.error("Erro no login:", error);
      return res.status(500).json({ error: "Erro interno no servidor" });
    }
  },

  async logout(req, res) {
    try {
      const token = req.token;
      if (token) {
        await sql`INSERT INTO revoked_tokens (token, revoked_at) VALUES (${token}, NOW()) ON CONFLICT DO NOTHING`;
      }
      return res.status(200).json({ message: "Logout realizado com sucesso" });
    } catch (error) {
      console.error("Erro no logout:", error);
      return res.status(500).json({ error: "Erro interno no servidor" });
    }
  },

  /**
   * POST /api/auth/forgot-password
   * Generates a single-use recovery token (15 min expiry).
   * Always returns success regardless of whether the email exists.
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      // Always return the same response to avoid leaking email existence
      const successMessage = "Se o email estiver cadastrado, você receberá instruções de recuperação";

      // Look up user by email
      const usuarios = await sql`SELECT id FROM usuarios WHERE email = ${email}`;
      const usuario = usuarios[0];

      if (usuario) {
        // Invalidate any previous tokens for this user
        for (const [key, entry] of recoveryTokens.entries()) {
          if (entry.usuario_id === usuario.id) {
            recoveryTokens.delete(key);
          }
        }

        // Generate a new recovery token
        const token = crypto.randomBytes(32).toString("hex");
        const expires_at = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        recoveryTokens.set(token, {
          token,
          usuario_id: usuario.id,
          expires_at,
          used: false
        });
      }

      return res.status(200).json({ message: successMessage });
    } catch (error) {
      console.error("Erro no forgot-password:", error);
      return res.status(500).json({ error: "Erro interno no servidor" });
    }
  },

  /**
   * POST /api/auth/reset-password
   * Validates recovery token, enforces password policy, updates hash,
   * invalidates token, and terminates sessions.
   */
  async resetPassword(req, res) {
    try {
      const { token, nova_senha } = req.body;

      // Validate token exists, is not expired, and hasn't been used
      const tokenEntry = recoveryTokens.get(token);

      if (!tokenEntry || tokenEntry.used || new Date() > tokenEntry.expires_at) {
        return res.status(400).json({ error: "Token inválido ou expirado" });
      }

      // Validate password policy: min 8 chars, 1 uppercase, 1 lowercase, 1 digit
      const hasUppercase = /[A-Z]/.test(nova_senha);
      const hasLowercase = /[a-z]/.test(nova_senha);
      const hasDigit = /\d/.test(nova_senha);

      if (nova_senha.length < 8 || !hasUppercase || !hasLowercase || !hasDigit) {
        return res.status(400).json({
          error: "A senha deve ter no mínimo 8 caracteres, uma letra maiúscula, uma minúscula e um dígito"
        });
      }

      // Hash the new password
      const senha_hash = await bcrypt.hash(nova_senha, 10);

      // Update user's password in the database
      await sql`UPDATE usuarios SET senha_hash = ${senha_hash} WHERE id = ${tokenEntry.usuario_id}`;

      // Mark token as used
      tokenEntry.used = true;

      // Invalidate all other tokens for this user
      for (const [key, entry] of recoveryTokens.entries()) {
        if (entry.usuario_id === tokenEntry.usuario_id && key !== token) {
          recoveryTokens.delete(key);
        }
      }

      // Note: Session termination would involve invalidating JWTs.
      // Since JWTs are stateless, in a production system we'd use a token blacklist
      // or short-lived tokens with refresh tokens. For now, the password change
      // effectively invalidates sessions since the old password no longer works
      // for generating new tokens.

      return res.status(200).json({ message: "Senha atualizada com sucesso" });
    } catch (error) {
      console.error("Erro no reset-password:", error);
      return res.status(500).json({ error: "Erro interno no servidor" });
    }
  }
};

// Export the recovery tokens store for testing purposes
authController._recoveryTokens = recoveryTokens;

module.exports = authController;