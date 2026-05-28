const jwt = require('jsonwebtoken');
const authMiddleware = require('../../src/middlewares/authMiddleware');

const JWT_SECRET = 'test-secret-key';

// Set env for tests
beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

// Helper to create mock req/res/next
function createMocks(authHeader) {
  const req = {
    headers: {}
  };
  if (authHeader !== undefined) {
    req.headers.authorization = authHeader;
  }
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
  const next = jest.fn();
  return { req, res, next };
}

function generateValidToken(payload = {}, options = {}) {
  const defaultPayload = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    tipo_perfil: 'CONSUMIDOR',
    ...payload
  };
  return jwt.sign(defaultPayload, JWT_SECRET, { expiresIn: '24h', ...options });
}

describe('authMiddleware', () => {
  describe('token ausente', () => {
    it('deve retornar 401 quando header Authorization está ausente', () => {
      const { req, res, next } = createMocks(undefined);
      authMiddleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando header Authorization está vazio', () => {
      const { req, res, next } = createMocks('');
      authMiddleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('formato inválido', () => {
    it('deve retornar 401 quando header não começa com Bearer', () => {
      const { req, res, next } = createMocks('Basic some-token');
      authMiddleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando header é apenas "Bearer " sem token', () => {
      const { req, res, next } = createMocks('Bearer ');
      authMiddleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando header é apenas "Bearer" sem espaço', () => {
      const { req, res, next } = createMocks('Bearer');
      authMiddleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('token inválido', () => {
    it('deve retornar 401 quando token é uma string aleatória', () => {
      const { req, res, next } = createMocks('Bearer invalid-token-string');
      authMiddleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 401 quando token foi assinado com secret diferente', () => {
      const token = jwt.sign({ id: 'user-1', tipo_perfil: 'CONSUMIDOR' }, 'wrong-secret', { expiresIn: '24h' });
      const { req, res, next } = createMocks(`Bearer ${token}`);
      authMiddleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('token expirado', () => {
    it('deve retornar 401 quando token está expirado', () => {
      const token = jwt.sign(
        { id: 'user-1', tipo_perfil: 'CONSUMIDOR' },
        JWT_SECRET,
        { expiresIn: '-1s' }
      );
      const { req, res, next } = createMocks(`Bearer ${token}`);
      authMiddleware(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('token válido', () => {
    it('deve chamar next() e anexar usuario_id e tipo_perfil ao req para CONSUMIDOR', () => {
      const token = generateValidToken({ id: 'user-123', tipo_perfil: 'CONSUMIDOR' });
      const { req, res, next } = createMocks(`Bearer ${token}`);
      authMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.usuario_id).toBe('user-123');
      expect(req.tipo_perfil).toBe('CONSUMIDOR');
      expect(res.statusCode).toBeNull();
    });

    it('deve chamar next() e anexar usuario_id e tipo_perfil ao req para CACAMBEIRO', () => {
      const token = generateValidToken({ id: 'cacambeiro-456', tipo_perfil: 'CACAMBEIRO' });
      const { req, res, next } = createMocks(`Bearer ${token}`);
      authMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.usuario_id).toBe('cacambeiro-456');
      expect(req.tipo_perfil).toBe('CACAMBEIRO');
    });

    it('deve chamar next() e anexar usuario_id e tipo_perfil ao req para ADMIN', () => {
      const token = generateValidToken({ id: 'admin-789', tipo_perfil: 'ADMIN' });
      const { req, res, next } = createMocks(`Bearer ${token}`);
      authMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.usuario_id).toBe('admin-789');
      expect(req.tipo_perfil).toBe('ADMIN');
    });
  });

  describe('mensagem de erro genérica', () => {
    it('deve retornar a mesma mensagem de erro para todos os cenários de falha', () => {
      const expectedError = { error: 'Token inválido ou expirado' };

      // Sem header
      const mock1 = createMocks(undefined);
      authMiddleware(mock1.req, mock1.res, mock1.next);
      expect(mock1.res.jsonData).toEqual(expectedError);

      // Formato inválido
      const mock2 = createMocks('InvalidFormat');
      authMiddleware(mock2.req, mock2.res, mock2.next);
      expect(mock2.res.jsonData).toEqual(expectedError);

      // Token inválido
      const mock3 = createMocks('Bearer garbage');
      authMiddleware(mock3.req, mock3.res, mock3.next);
      expect(mock3.res.jsonData).toEqual(expectedError);

      // Token expirado
      const expiredToken = jwt.sign({ id: 'x', tipo_perfil: 'CONSUMIDOR' }, JWT_SECRET, { expiresIn: '-1s' });
      const mock4 = createMocks(`Bearer ${expiredToken}`);
      authMiddleware(mock4.req, mock4.res, mock4.next);
      expect(mock4.res.jsonData).toEqual(expectedError);
    });
  });
});
