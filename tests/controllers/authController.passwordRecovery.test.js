const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Mock do módulo sql
jest.mock('../../src/config/db', () => jest.fn());
const sql = require('../../src/config/db');

// Mock do rateLimitMiddleware
jest.mock('../../src/middlewares/rateLimitMiddleware', () => ({
  recordFailedAttempt: jest.fn(),
  resetAttempts: jest.fn(),
  getClientIp: jest.fn(() => '127.0.0.1'),
  rateLimitMiddleware: jest.fn((req, res, next) => next())
}));

const authController = require('../../src/controllers/authController');

// Helper para criar mock de req/res
function createMocks(body = {}) {
  const req = { body };
  const res = {
    statusCode: null,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
  return { req, res };
}

describe('authController.forgotPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear recovery tokens between tests
    authController._recoveryTokens.clear();
  });

  it('deve retornar 200 com mensagem de sucesso quando email existe', async () => {
    sql.mockResolvedValueOnce([{ id: 'user-123' }]);

    const { req, res } = createMocks({ email: 'joao@example.com' });
    await authController.forgotPassword(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.message).toBe('Se o email estiver cadastrado, você receberá instruções de recuperação');
  });

  it('deve retornar 200 com mesma mensagem quando email não existe', async () => {
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({ email: 'naoexiste@example.com' });
    await authController.forgotPassword(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.message).toBe('Se o email estiver cadastrado, você receberá instruções de recuperação');
  });

  it('deve gerar token de recuperação quando email existe', async () => {
    sql.mockResolvedValueOnce([{ id: 'user-123' }]);

    const { req, res } = createMocks({ email: 'joao@example.com' });
    await authController.forgotPassword(req, res);

    expect(authController._recoveryTokens.size).toBe(1);
    const [, entry] = [...authController._recoveryTokens.entries()][0];
    expect(entry.usuario_id).toBe('user-123');
    expect(entry.used).toBe(false);
    expect(entry.expires_at).toBeInstanceOf(Date);
  });

  it('deve gerar token com expiração de 15 minutos', async () => {
    sql.mockResolvedValueOnce([{ id: 'user-123' }]);

    const now = Date.now();
    const { req, res } = createMocks({ email: 'joao@example.com' });
    await authController.forgotPassword(req, res);

    const [, entry] = [...authController._recoveryTokens.entries()][0];
    const diffMs = entry.expires_at.getTime() - now;
    // Should be approximately 15 minutes (900000ms), allow small tolerance for execution time
    expect(diffMs).toBeGreaterThan(895000);
    expect(diffMs).toBeLessThanOrEqual(905000);
  });

  it('deve invalidar tokens anteriores do mesmo usuário', async () => {
    // First request - creates a token
    sql.mockResolvedValueOnce([{ id: 'user-123' }]);
    const { req: req1, res: res1 } = createMocks({ email: 'joao@example.com' });
    await authController.forgotPassword(req1, res1);

    expect(authController._recoveryTokens.size).toBe(1);
    const firstToken = [...authController._recoveryTokens.keys()][0];

    // Second request - should invalidate the first token
    sql.mockResolvedValueOnce([{ id: 'user-123' }]);
    const { req: req2, res: res2 } = createMocks({ email: 'joao@example.com' });
    await authController.forgotPassword(req2, res2);

    expect(authController._recoveryTokens.size).toBe(1);
    expect(authController._recoveryTokens.has(firstToken)).toBe(false);
  });

  it('não deve gerar token quando email não existe', async () => {
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({ email: 'naoexiste@example.com' });
    await authController.forgotPassword(req, res);

    expect(authController._recoveryTokens.size).toBe(0);
  });

  it('deve retornar 500 para erros inesperados', async () => {
    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks({ email: 'joao@example.com' });
    await authController.forgotPassword(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.jsonData.error).toContain('Erro interno');
  });
});

describe('authController.resetPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authController._recoveryTokens.clear();
  });

  it('deve retornar 200 e atualizar senha com token válido e senha válida', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });

    sql.mockResolvedValueOnce([]); // UPDATE query

    const { req, res } = createMocks({ token, nova_senha: 'NovaSenha1' });
    await authController.resetPassword(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.message).toBe('Senha atualizada com sucesso');
  });

  it('deve marcar token como usado após reset bem-sucedido', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });

    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({ token, nova_senha: 'NovaSenha1' });
    await authController.resetPassword(req, res);

    expect(authController._recoveryTokens.get(token).used).toBe(true);
  });

  it('deve atualizar o hash da senha no banco de dados', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });

    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({ token, nova_senha: 'NovaSenha1' });
    await authController.resetPassword(req, res);

    // Verify sql was called (the UPDATE query)
    expect(sql).toHaveBeenCalled();
  });

  it('deve retornar 400 para token inexistente', async () => {
    const { req, res } = createMocks({ token: 'token-invalido', nova_senha: 'NovaSenha1' });
    await authController.resetPassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('Token inválido ou expirado');
  });

  it('deve retornar 400 para token expirado', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() - 1000), // Already expired
      used: false
    });

    const { req, res } = createMocks({ token, nova_senha: 'NovaSenha1' });
    await authController.resetPassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('Token inválido ou expirado');
  });

  it('deve retornar 400 para token já utilizado', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: true // Already used
    });

    const { req, res } = createMocks({ token, nova_senha: 'NovaSenha1' });
    await authController.resetPassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('Token inválido ou expirado');
  });

  it('deve retornar 400 quando senha não atende política - sem maiúscula', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });

    const { req, res } = createMocks({ token, nova_senha: 'novasenha1' });
    await authController.resetPassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('A senha deve ter no mínimo 8 caracteres, uma letra maiúscula, uma minúscula e um dígito');
  });

  it('deve retornar 400 quando senha não atende política - sem minúscula', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });

    const { req, res } = createMocks({ token, nova_senha: 'NOVASENHA1' });
    await authController.resetPassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('A senha deve ter no mínimo 8 caracteres, uma letra maiúscula, uma minúscula e um dígito');
  });

  it('deve retornar 400 quando senha não atende política - sem dígito', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });

    const { req, res } = createMocks({ token, nova_senha: 'NovaSenha' });
    await authController.resetPassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('A senha deve ter no mínimo 8 caracteres, uma letra maiúscula, uma minúscula e um dígito');
  });

  it('deve retornar 400 quando senha tem menos de 8 caracteres', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });

    const { req, res } = createMocks({ token, nova_senha: 'Ab1' });
    await authController.resetPassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe('A senha deve ter no mínimo 8 caracteres, uma letra maiúscula, uma minúscula e um dígito');
  });

  it('deve invalidar outros tokens do mesmo usuário após reset', async () => {
    const token1 = crypto.randomBytes(32).toString('hex');
    const token2 = crypto.randomBytes(32).toString('hex');

    authController._recoveryTokens.set(token1, {
      token: token1,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });
    authController._recoveryTokens.set(token2, {
      token: token2,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });

    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({ token: token1, nova_senha: 'NovaSenha1' });
    await authController.resetPassword(req, res);

    expect(res.statusCode).toBe(200);
    // token1 should be marked as used, token2 should be deleted
    expect(authController._recoveryTokens.get(token1).used).toBe(true);
    expect(authController._recoveryTokens.has(token2)).toBe(false);
  });

  it('deve retornar 500 para erros inesperados', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: 'user-123',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });

    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks({ token, nova_senha: 'NovaSenha1' });
    await authController.resetPassword(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.jsonData.error).toContain('Erro interno');
  });
});
