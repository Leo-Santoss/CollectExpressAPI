const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

const { recordFailedAttempt, resetAttempts, getClientIp } = require('../../src/middlewares/rateLimitMiddleware');
const authController = require('../../src/controllers/authController');

// Set JWT_SECRET for tests
process.env.JWT_SECRET = 'test-secret-key';

// Helper para criar mock de req/res
function createMocks(body = {}) {
  const req = {
    body,
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' }
  };
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

describe('authController.login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login bem-sucedido', () => {
    it('deve retornar 200 com token JWT válido para credenciais corretas', async () => {
      const senha = 'Senha123';
      const senhaHash = await bcrypt.hash(senha, 10);
      const mockUser = {
        id: 'uuid-123',
        nome_completo: 'João da Silva',
        email: 'joao@example.com',
        tipo_perfil: 'CONSUMIDOR',
        senha_hash: senhaHash
      };

      sql.mockResolvedValueOnce([mockUser]);

      const { req, res } = createMocks({ email: 'joao@example.com', senha });
      await authController.login(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toHaveProperty('token');
      expect(res.jsonData.usuario).toEqual({
        id: 'uuid-123',
        nome_completo: 'João da Silva',
        tipo_perfil: 'CONSUMIDOR'
      });
    });

    it('deve gerar JWT com id e tipo_perfil no payload e expiração de 24h', async () => {
      const senha = 'Senha123';
      const senhaHash = await bcrypt.hash(senha, 10);
      const mockUser = {
        id: 'uuid-456',
        nome_completo: 'Maria Transportes',
        email: 'maria@example.com',
        tipo_perfil: 'CACAMBEIRO',
        senha_hash: senhaHash
      };

      sql.mockResolvedValueOnce([mockUser]);

      const { req, res } = createMocks({ email: 'maria@example.com', senha });
      await authController.login(req, res);

      expect(res.statusCode).toBe(200);

      const decoded = jwt.verify(res.jsonData.token, process.env.JWT_SECRET);
      expect(decoded.id).toBe('uuid-456');
      expect(decoded.tipo_perfil).toBe('CACAMBEIRO');
      // Verify 24h expiry (exp - iat should be 86400 seconds)
      expect(decoded.exp - decoded.iat).toBe(86400);
    });

    it('deve chamar resetAttempts com o IP após login bem-sucedido', async () => {
      const senha = 'Senha123';
      const senhaHash = await bcrypt.hash(senha, 10);
      const mockUser = {
        id: 'uuid-123',
        nome_completo: 'João',
        email: 'joao@example.com',
        tipo_perfil: 'CONSUMIDOR',
        senha_hash: senhaHash
      };

      sql.mockResolvedValueOnce([mockUser]);

      const { req, res } = createMocks({ email: 'joao@example.com', senha });
      await authController.login(req, res);

      expect(resetAttempts).toHaveBeenCalledWith('127.0.0.1');
      expect(recordFailedAttempt).not.toHaveBeenCalled();
    });
  });

  describe('credenciais inválidas', () => {
    it('deve retornar 401 com "Credenciais inválidas" quando email não existe', async () => {
      sql.mockResolvedValueOnce([]);

      const { req, res } = createMocks({ email: 'naoexiste@example.com', senha: 'Senha123' });
      await authController.login(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Credenciais inválidas' });
    });

    it('deve retornar 401 com "Credenciais inválidas" quando senha está incorreta', async () => {
      const senhaHash = await bcrypt.hash('SenhaCorreta1', 10);
      const mockUser = {
        id: 'uuid-123',
        nome_completo: 'João',
        email: 'joao@example.com',
        tipo_perfil: 'CONSUMIDOR',
        senha_hash: senhaHash
      };

      sql.mockResolvedValueOnce([mockUser]);

      const { req, res } = createMocks({ email: 'joao@example.com', senha: 'SenhaErrada1' });
      await authController.login(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Credenciais inválidas' });
    });

    it('deve usar mensagem genérica sem revelar se email ou senha está errado', async () => {
      // Caso 1: email não existe
      sql.mockResolvedValueOnce([]);
      const { req: req1, res: res1 } = createMocks({ email: 'x@example.com', senha: 'Senha123' });
      await authController.login(req1, res1);

      // Caso 2: senha errada
      const senhaHash = await bcrypt.hash('SenhaCorreta1', 10);
      sql.mockResolvedValueOnce([{ id: '1', senha_hash: senhaHash, tipo_perfil: 'CONSUMIDOR' }]);
      const { req: req2, res: res2 } = createMocks({ email: 'y@example.com', senha: 'SenhaErrada1' });
      await authController.login(req2, res2);

      // Ambos devem ter a mesma mensagem genérica
      expect(res1.jsonData.error).toBe(res2.jsonData.error);
      expect(res1.jsonData.error).toBe('Credenciais inválidas');
    });

    it('deve chamar recordFailedAttempt quando email não existe', async () => {
      sql.mockResolvedValueOnce([]);

      const { req, res } = createMocks({ email: 'naoexiste@example.com', senha: 'Senha123' });
      await authController.login(req, res);

      expect(recordFailedAttempt).toHaveBeenCalledWith('127.0.0.1');
      expect(resetAttempts).not.toHaveBeenCalled();
    });

    it('deve chamar recordFailedAttempt quando senha está incorreta', async () => {
      const senhaHash = await bcrypt.hash('SenhaCorreta1', 10);
      sql.mockResolvedValueOnce([{ id: '1', senha_hash: senhaHash, tipo_perfil: 'CONSUMIDOR' }]);

      const { req, res } = createMocks({ email: 'joao@example.com', senha: 'SenhaErrada1' });
      await authController.login(req, res);

      expect(recordFailedAttempt).toHaveBeenCalledWith('127.0.0.1');
      expect(resetAttempts).not.toHaveBeenCalled();
    });
  });

  describe('erros internos', () => {
    it('deve retornar 500 para erros inesperados', async () => {
      sql.mockRejectedValueOnce(new Error('Connection failed'));

      const { req, res } = createMocks({ email: 'joao@example.com', senha: 'Senha123' });
      await authController.login(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData.error).toContain('Erro interno');
    });
  });
});
