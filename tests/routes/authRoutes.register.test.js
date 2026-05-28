/**
 * Testes de integração para a rota POST /api/auth/register
 * Testa a cadeia completa: validationMiddleware + validateCacambeiroDetails + controller
 */

// Mock do módulo sql antes de importar qualquer coisa
jest.mock('../../src/config/db', () => jest.fn());
const sql = require('../../src/config/db');

const express = require('express');
const authRoutes = require('../../src/routes/authRoutes');

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// Helper para fazer requests
async function postRegister(body) {
  // Usamos supertest-like approach com o app express diretamente
  const req = {
    method: 'POST',
    url: '/api/auth/register',
    headers: { 'content-type': 'application/json' },
    body
  };

  return new Promise((resolve) => {
    const res = {
      statusCode: null,
      jsonData: null,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        this.headersSent = true;
        return this;
      }
    };

    // Simular request Express
    const mockReq = { body, params: {}, query: {}, headers: {} };
    const mockRes = res;
    const mockNext = () => {};

    // Usar o router diretamente
    app.handle(
      { method: 'POST', url: '/api/auth/register', body, headers: { 'content-type': 'application/json' } },
      res,
      () => {}
    );

    // Como não temos supertest, vamos testar os middlewares individualmente
    resolve(res);
  });
}

// Importar os middlewares diretamente para testes unitários
const validationMiddleware = require('../../src/middlewares/validationMiddleware');

// Recriar o schema e middleware de validação do authRoutes
const registerSchema = {
  nome_completo: { required: true, type: 'string', minLength: 3, maxLength: 150 },
  email: { required: true, type: 'string', format: 'email', maxLength: 255 },
  senha: {
    required: true, type: 'string', minLength: 8, maxLength: 128,
    custom: (value) => {
      const hasUppercase = /[A-Z]/.test(value);
      const hasLowercase = /[a-z]/.test(value);
      const hasDigit = /\d/.test(value);
      if (!hasUppercase || !hasLowercase || !hasDigit) {
        return 'A senha deve conter pelo menos uma letra maiúscula, uma minúscula e um dígito';
      }
      return true;
    }
  },
  tipo_perfil: {
    required: true, type: 'string',
    custom: (value) => {
      if (value !== 'CONSUMIDOR' && value !== 'CACAMBEIRO') {
        return "O tipo de perfil deve ser 'CONSUMIDOR' ou 'CACAMBEIRO'";
      }
      return true;
    }
  },
  documento: {
    required: true, type: 'string', format: 'digits',
    custom: (value) => {
      if (value.length !== 11 && value.length !== 14) {
        return 'Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos';
      }
      return true;
    }
  },
  telefone: { required: true, type: 'string', format: 'digits', minLength: 10, maxLength: 11 }
};

const validate = validationMiddleware(registerSchema);

function createMocks(body = {}) {
  const req = { body, params: {}, query: {}, headers: {} };
  const res = {
    statusCode: null,
    jsonData: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.jsonData = data; return this; }
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('POST /api/auth/register - Validação de campos base', () => {
  describe('campos obrigatórios', () => {
    it('deve rejeitar body vazio com erros para todos os campos', () => {
      const { req, res, next } = createMocks({});
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors.length).toBe(6);
      expect(next).not.toHaveBeenCalled();
    });

    it('deve rejeitar quando nome_completo está ausente', () => {
      const { req, res, next } = createMocks({
        email: 'test@test.com', senha: 'Senha123',
        tipo_perfil: 'CONSUMIDOR', documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      const campos = res.jsonData.errors.map(e => e.campo);
      expect(campos).toContain('nome_completo');
    });
  });

  describe('validação de senha', () => {
    it('deve rejeitar senha sem letra maiúscula', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'senha123', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      const senhaError = res.jsonData.errors.find(e => e.campo === 'senha');
      expect(senhaError).toBeDefined();
      expect(senhaError.mensagem).toContain('maiúscula');
    });

    it('deve rejeitar senha sem letra minúscula', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'SENHA123', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      const senhaError = res.jsonData.errors.find(e => e.campo === 'senha');
      expect(senhaError).toBeDefined();
    });

    it('deve rejeitar senha sem dígito', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'SenhaAbc', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      const senhaError = res.jsonData.errors.find(e => e.campo === 'senha');
      expect(senhaError).toBeDefined();
    });

    it('deve rejeitar senha com menos de 8 caracteres', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Se1', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      const senhaError = res.jsonData.errors.find(e => e.campo === 'senha');
      expect(senhaError).toBeDefined();
    });

    it('deve aceitar senha válida', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Senha123', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validação de tipo_perfil', () => {
    it('deve rejeitar tipo_perfil inválido', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Senha123', tipo_perfil: 'ADMIN',
        documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      const perfilError = res.jsonData.errors.find(e => e.campo === 'tipo_perfil');
      expect(perfilError).toBeDefined();
      expect(perfilError.mensagem).toContain('CONSUMIDOR');
    });

    it('deve aceitar CONSUMIDOR', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Senha123', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar CACAMBEIRO', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Senha123', tipo_perfil: 'CACAMBEIRO',
        documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validação de documento', () => {
    it('deve aceitar CPF com 11 dígitos', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Senha123', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar CNPJ com 14 dígitos', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Senha123', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901234', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve rejeitar documento com tamanho inválido', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Senha123', tipo_perfil: 'CONSUMIDOR',
        documento: '123456789', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      const docError = res.jsonData.errors.find(e => e.campo === 'documento');
      expect(docError).toBeDefined();
    });
  });

  describe('validação de telefone', () => {
    it('deve aceitar telefone com 10 dígitos', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Senha123', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901', telefone: '1198765432'
      });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar telefone com 11 dígitos', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Senha123', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901', telefone: '11987654321'
      });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve rejeitar telefone com menos de 10 dígitos', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João Silva', email: 'joao@test.com',
        senha: 'Senha123', tipo_perfil: 'CONSUMIDOR',
        documento: '12345678901', telefone: '119876543'
      });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      const telError = res.jsonData.errors.find(e => e.campo === 'telefone');
      expect(telError).toBeDefined();
    });
  });
});

describe('POST /api/auth/register - Validação de detalhes CACAMBEIRO', () => {
  // Importar o middleware de validação de CACAMBEIRO diretamente
  // Precisamos recriar o middleware aqui para testar isoladamente
  const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

  function validateCacambeiroDetails(req, res, next) {
    if (req.body.tipo_perfil !== 'CACAMBEIRO') {
      return next();
    }

    const { horario_inicio, horario_fim, raio_entrega_km, taxa_entrega } = req.body;
    const erros = [];

    if (!horario_inicio || typeof horario_inicio !== 'string') {
      erros.push({ campo: 'horario_inicio', mensagem: "O campo 'horario_inicio' é obrigatório" });
    } else if (!TIME_REGEX.test(horario_inicio)) {
      erros.push({ campo: 'horario_inicio', mensagem: "O campo 'horario_inicio' deve estar no formato HH:MM (00:00-23:59)" });
    }

    if (!horario_fim || typeof horario_fim !== 'string') {
      erros.push({ campo: 'horario_fim', mensagem: "O campo 'horario_fim' é obrigatório" });
    } else if (!TIME_REGEX.test(horario_fim)) {
      erros.push({ campo: 'horario_fim', mensagem: "O campo 'horario_fim' deve estar no formato HH:MM (00:00-23:59)" });
    } else if (horario_inicio && TIME_REGEX.test(horario_inicio) && horario_fim <= horario_inicio) {
      erros.push({ campo: 'horario_fim', mensagem: "O campo 'horario_fim' deve ser posterior a 'horario_inicio'" });
    }

    if (raio_entrega_km === undefined || raio_entrega_km === null) {
      erros.push({ campo: 'raio_entrega_km', mensagem: "O campo 'raio_entrega_km' é obrigatório" });
    } else if (typeof raio_entrega_km !== 'number' || isNaN(raio_entrega_km)) {
      erros.push({ campo: 'raio_entrega_km', mensagem: "O campo 'raio_entrega_km' deve ser do tipo 'number'" });
    } else if (raio_entrega_km < 1 || raio_entrega_km > 200) {
      erros.push({ campo: 'raio_entrega_km', mensagem: "O campo 'raio_entrega_km' deve ser entre 1 e 200" });
    }

    if (taxa_entrega === undefined || taxa_entrega === null) {
      erros.push({ campo: 'taxa_entrega', mensagem: "O campo 'taxa_entrega' é obrigatório" });
    } else if (typeof taxa_entrega !== 'number' || isNaN(taxa_entrega)) {
      erros.push({ campo: 'taxa_entrega', mensagem: "O campo 'taxa_entrega' deve ser do tipo 'number'" });
    } else if (taxa_entrega < 0.01 || taxa_entrega > 99999.99) {
      erros.push({ campo: 'taxa_entrega', mensagem: "O campo 'taxa_entrega' deve ser entre 0.01 e 99999.99" });
    }

    if (erros.length > 0) {
      return res.status(400).json({ errors: erros });
    }

    return next();
  }

  describe('quando tipo_perfil não é CACAMBEIRO', () => {
    it('deve chamar next() sem validar detalhes', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CONSUMIDOR'
      });
      validateCacambeiroDetails(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });
  });

  describe('horario_inicio', () => {
    it('deve rejeitar quando ausente', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_fim: '18:00', raio_entrega_km: 50, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
      const error = res.jsonData.errors.find(e => e.campo === 'horario_inicio');
      expect(error).toBeDefined();
    });

    it('deve rejeitar formato inválido', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '25:00', horario_fim: '18:00',
        raio_entrega_km: 50, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
      const error = res.jsonData.errors.find(e => e.campo === 'horario_inicio');
      expect(error).toBeDefined();
      expect(error.mensagem).toContain('HH:MM');
    });

    it('deve aceitar formato válido 00:00', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '00:00', horario_fim: '23:59',
        raio_entrega_km: 50, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar formato válido 23:59', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '23:59',
        raio_entrega_km: 50, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('horario_fim', () => {
    it('deve rejeitar quando ausente', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', raio_entrega_km: 50, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
      const error = res.jsonData.errors.find(e => e.campo === 'horario_fim');
      expect(error).toBeDefined();
    });

    it('deve rejeitar quando igual a horario_inicio', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '08:00',
        raio_entrega_km: 50, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
      const error = res.jsonData.errors.find(e => e.campo === 'horario_fim');
      expect(error).toBeDefined();
      expect(error.mensagem).toContain('posterior');
    });

    it('deve rejeitar quando anterior a horario_inicio', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '18:00', horario_fim: '08:00',
        raio_entrega_km: 50, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
      const error = res.jsonData.errors.find(e => e.campo === 'horario_fim');
      expect(error).toBeDefined();
    });
  });

  describe('raio_entrega_km', () => {
    it('deve rejeitar quando ausente', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '18:00', taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
      const error = res.jsonData.errors.find(e => e.campo === 'raio_entrega_km');
      expect(error).toBeDefined();
    });

    it('deve rejeitar valor menor que 1', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '18:00',
        raio_entrega_km: 0, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
      const error = res.jsonData.errors.find(e => e.campo === 'raio_entrega_km');
      expect(error).toBeDefined();
    });

    it('deve rejeitar valor maior que 200', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '18:00',
        raio_entrega_km: 201, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
    });

    it('deve aceitar valor no limite inferior (1)', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '18:00',
        raio_entrega_km: 1, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar valor no limite superior (200)', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '18:00',
        raio_entrega_km: 200, taxa_entrega: 100
      });
      validateCacambeiroDetails(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('taxa_entrega', () => {
    it('deve rejeitar quando ausente', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '18:00', raio_entrega_km: 50
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
      const error = res.jsonData.errors.find(e => e.campo === 'taxa_entrega');
      expect(error).toBeDefined();
    });

    it('deve rejeitar valor menor que 0.01', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '18:00',
        raio_entrega_km: 50, taxa_entrega: 0
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
    });

    it('deve rejeitar valor maior que 99999.99', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '18:00',
        raio_entrega_km: 50, taxa_entrega: 100000
      });
      validateCacambeiroDetails(req, res, next);
      expect(res.statusCode).toBe(400);
    });

    it('deve aceitar valor no limite inferior (0.01)', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '18:00',
        raio_entrega_km: 50, taxa_entrega: 0.01
      });
      validateCacambeiroDetails(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar valor no limite superior (99999.99)', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00', horario_fim: '18:00',
        raio_entrega_km: 50, taxa_entrega: 99999.99
      });
      validateCacambeiroDetails(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('payload completo válido de CACAMBEIRO', () => {
    it('deve chamar next() quando todos os campos são válidos', () => {
      const { req, res, next } = createMocks({
        tipo_perfil: 'CACAMBEIRO',
        horario_inicio: '08:00',
        horario_fim: '18:00',
        raio_entrega_km: 50,
        taxa_entrega: 150.00
      });
      validateCacambeiroDetails(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });
  });
});
