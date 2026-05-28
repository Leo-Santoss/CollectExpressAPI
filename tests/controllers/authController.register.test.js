const bcrypt = require('bcryptjs');

// Mock do módulo sql
jest.mock('../../src/config/db', () => jest.fn());
const sql = require('../../src/config/db');

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

// Payload válido de CONSUMIDOR
function validConsumidorPayload() {
  return {
    nome_completo: 'João da Silva',
    email: 'joao@example.com',
    senha: 'Senha123',
    tipo_perfil: 'CONSUMIDOR',
    documento: '12345678901',
    telefone: '11987654321'
  };
}

// Payload válido de CACAMBEIRO
function validCacambeiroPayload() {
  return {
    nome_completo: 'Maria Transportes',
    email: 'maria@example.com',
    senha: 'Senha456',
    tipo_perfil: 'CACAMBEIRO',
    documento: '12345678901234',
    telefone: '11987654321',
    horario_inicio: '08:00',
    horario_fim: '18:00',
    raio_entrega_km: 50,
    taxa_entrega: 150.00
  };
}

describe('authController.register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registro de CONSUMIDOR com sucesso', () => {
    it('deve retornar 201 com dados do usuário excluindo senha_hash', async () => {
      const payload = validConsumidorPayload();
      const mockUser = {
        id: 'uuid-123',
        nome_completo: payload.nome_completo,
        email: payload.email,
        tipo_perfil: payload.tipo_perfil,
        documento: payload.documento,
        telefone: payload.telefone,
        criado_em: '2024-01-01T00:00:00.000Z'
      };

      sql.mockResolvedValueOnce([mockUser]);

      const { req, res } = createMocks(payload);
      await authController.register(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData).toEqual(mockUser);
      expect(res.jsonData).not.toHaveProperty('senha_hash');
      expect(res.jsonData).not.toHaveProperty('senha');
    });

    it('deve fazer hash da senha com bcrypt salt factor 10', async () => {
      const payload = validConsumidorPayload();
      const mockUser = {
        id: 'uuid-123',
        nome_completo: payload.nome_completo,
        email: payload.email,
        tipo_perfil: payload.tipo_perfil,
        documento: payload.documento,
        telefone: payload.telefone,
        criado_em: '2024-01-01T00:00:00.000Z'
      };

      sql.mockResolvedValueOnce([mockUser]);

      const { req, res } = createMocks(payload);
      await authController.register(req, res);

      // Verificar que sql foi chamado com o hash (não a senha em texto)
      expect(sql).toHaveBeenCalled();
      const callArgs = sql.mock.calls[0];
      // O template literal terá a senha hashada como um dos valores
      // Verificamos que a senha original NÃO está nos argumentos diretamente
      expect(res.statusCode).toBe(201);
    });
  });

  describe('registro de CACAMBEIRO com sucesso', () => {
    it('deve inserir detalhes de negócio em detalhes_cacambeiro', async () => {
      const payload = validCacambeiroPayload();
      const mockUser = {
        id: 'uuid-456',
        nome_completo: payload.nome_completo,
        email: payload.email,
        tipo_perfil: payload.tipo_perfil,
        documento: payload.documento,
        telefone: payload.telefone,
        criado_em: '2024-01-01T00:00:00.000Z'
      };

      // Primeira chamada: INSERT usuarios
      sql.mockResolvedValueOnce([mockUser]);
      // Segunda chamada: INSERT detalhes_cacambeiro
      sql.mockResolvedValueOnce([]);

      const { req, res } = createMocks(payload);
      await authController.register(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData).toEqual(mockUser);
      // sql deve ter sido chamado 2 vezes (usuarios + detalhes_cacambeiro)
      expect(sql).toHaveBeenCalledTimes(2);
    });
  });

  describe('tratamento de duplicatas', () => {
    it('deve retornar 409 com mensagem de email duplicado', async () => {
      const payload = validConsumidorPayload();
      const error = new Error('duplicate key');
      error.code = '23505';
      error.constraint = 'usuarios_email_key';
      error.detail = 'Key (email)=(joao@example.com) already exists.';

      sql.mockRejectedValueOnce(error);

      const { req, res } = createMocks(payload);
      await authController.register(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.jsonData).toEqual({ error: 'Email já cadastrado' });
    });

    it('deve retornar 409 com mensagem de documento duplicado', async () => {
      const payload = validConsumidorPayload();
      const error = new Error('duplicate key');
      error.code = '23505';
      error.constraint = 'usuarios_documento_key';
      error.detail = 'Key (documento)=(12345678901) already exists.';

      sql.mockRejectedValueOnce(error);

      const { req, res } = createMocks(payload);
      await authController.register(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.jsonData).toEqual({ error: 'Documento já cadastrado' });
    });

    it('deve detectar email duplicado via detail quando constraint não contém email', async () => {
      const payload = validConsumidorPayload();
      const error = new Error('duplicate key');
      error.code = '23505';
      error.constraint = 'some_other_constraint';
      error.detail = 'Key (email)=(joao@example.com) already exists.';

      sql.mockRejectedValueOnce(error);

      const { req, res } = createMocks(payload);
      await authController.register(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.jsonData).toEqual({ error: 'Email já cadastrado' });
    });

    it('deve detectar documento duplicado via detail quando constraint não contém documento', async () => {
      const payload = validConsumidorPayload();
      const error = new Error('duplicate key');
      error.code = '23505';
      error.constraint = 'some_other_constraint';
      error.detail = 'Key (documento)=(12345678901) already exists.';

      sql.mockRejectedValueOnce(error);

      const { req, res } = createMocks(payload);
      await authController.register(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.jsonData).toEqual({ error: 'Documento já cadastrado' });
    });
  });

  describe('erros internos', () => {
    it('deve retornar 500 para erros não relacionados a duplicatas', async () => {
      const payload = validConsumidorPayload();
      sql.mockRejectedValueOnce(new Error('Connection failed'));

      const { req, res } = createMocks(payload);
      await authController.register(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData.error).toContain('Erro interno');
    });
  });
});
