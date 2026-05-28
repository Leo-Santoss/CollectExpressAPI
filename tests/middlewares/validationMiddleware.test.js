const validationMiddleware = require('../../src/middlewares/validationMiddleware');

// Helper para criar mock de req/res/next
function createMocks(body = {}, source = 'body') {
  const req = { body: {}, params: {}, query: {} };
  req[source] = body;
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

describe('validationMiddleware', () => {
  describe('required', () => {
    const schema = { nome: { required: true, type: 'string' } };
    const validate = validationMiddleware(schema);

    it('deve rejeitar campo ausente', () => {
      const { req, res, next } = createMocks({});
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors).toHaveLength(1);
      expect(res.jsonData.errors[0].campo).toBe('nome');
      expect(res.jsonData.errors[0].mensagem).toContain('obrigatório');
      expect(next).not.toHaveBeenCalled();
    });

    it('deve rejeitar campo com valor null', () => {
      const { req, res, next } = createMocks({ nome: null });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].campo).toBe('nome');
    });

    it('deve rejeitar campo com string vazia', () => {
      const { req, res, next } = createMocks({ nome: '' });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
    });

    it('deve aceitar campo presente com valor válido', () => {
      const { req, res, next } = createMocks({ nome: 'João' });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });
  });

  describe('type', () => {
    it('deve rejeitar tipo string quando valor é número', () => {
      const validate = validationMiddleware({ campo: { type: 'string' } });
      const { req, res, next } = createMocks({ campo: 123 });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].mensagem).toContain("tipo 'string'");
    });

    it('deve rejeitar tipo number quando valor é string', () => {
      const validate = validationMiddleware({ campo: { type: 'number' } });
      const { req, res, next } = createMocks({ campo: 'abc' });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].mensagem).toContain("tipo 'number'");
    });

    it('deve rejeitar tipo integer quando valor é float', () => {
      const validate = validationMiddleware({ campo: { type: 'integer' } });
      const { req, res, next } = createMocks({ campo: 3.14 });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].mensagem).toContain("tipo 'integer'");
    });

    it('deve aceitar tipo integer quando valor é inteiro', () => {
      const validate = validationMiddleware({ campo: { type: 'integer' } });
      const { req, res, next } = createMocks({ campo: 5 });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve rejeitar tipo boolean quando valor é string', () => {
      const validate = validationMiddleware({ campo: { type: 'boolean' } });
      const { req, res, next } = createMocks({ campo: 'true' });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
    });

    it('deve aceitar tipo boolean quando valor é boolean', () => {
      const validate = validationMiddleware({ campo: { type: 'boolean' } });
      const { req, res, next } = createMocks({ campo: true });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve rejeitar NaN como number', () => {
      const validate = validationMiddleware({ campo: { type: 'number' } });
      const { req, res, next } = createMocks({ campo: NaN });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('minLength / maxLength', () => {
    const schema = { nome: { type: 'string', minLength: 3, maxLength: 150 } };
    const validate = validationMiddleware(schema);

    it('deve rejeitar string menor que minLength', () => {
      const { req, res, next } = createMocks({ nome: 'ab' });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].mensagem).toContain('mínimo 3 caracteres');
    });

    it('deve rejeitar string maior que maxLength', () => {
      const { req, res, next } = createMocks({ nome: 'a'.repeat(151) });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].mensagem).toContain('máximo 150 caracteres');
    });

    it('deve aceitar string dentro do intervalo', () => {
      const { req, res, next } = createMocks({ nome: 'João Silva' });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar string com exatamente minLength', () => {
      const { req, res, next } = createMocks({ nome: 'abc' });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar string com exatamente maxLength', () => {
      const { req, res, next } = createMocks({ nome: 'a'.repeat(150) });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('min / max (números)', () => {
    const schema = { preco: { type: 'number', min: 0.01, max: 999.99 } };
    const validate = validationMiddleware(schema);

    it('deve rejeitar número menor que min', () => {
      const { req, res, next } = createMocks({ preco: 0 });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].mensagem).toContain('mínimo 0.01');
    });

    it('deve rejeitar número maior que max', () => {
      const { req, res, next } = createMocks({ preco: 1000 });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].mensagem).toContain('máximo 999.99');
    });

    it('deve aceitar número dentro do intervalo', () => {
      const { req, res, next } = createMocks({ preco: 50.5 });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar número exatamente no min', () => {
      const { req, res, next } = createMocks({ preco: 0.01 });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar número exatamente no max', () => {
      const { req, res, next } = createMocks({ preco: 999.99 });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('format: email', () => {
    const schema = { email: { required: true, type: 'string', format: 'email' } };
    const validate = validationMiddleware(schema);

    it('deve aceitar email válido', () => {
      const { req, res, next } = createMocks({ email: 'user@example.com' });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar email com subdomínio', () => {
      const { req, res, next } = createMocks({ email: 'user@mail.example.com' });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve rejeitar email sem @', () => {
      const { req, res, next } = createMocks({ email: 'userexample.com' });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].mensagem).toContain('email válido');
    });

    it('deve rejeitar email sem domínio', () => {
      const { req, res, next } = createMocks({ email: 'user@' });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
    });

    it('deve rejeitar email sem local part', () => {
      const { req, res, next } = createMocks({ email: '@example.com' });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('format: digits', () => {
    const schema = { documento: { required: true, type: 'string', format: 'digits' } };
    const validate = validationMiddleware(schema);

    it('deve aceitar string com apenas dígitos', () => {
      const { req, res, next } = createMocks({ documento: '12345678901' });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve rejeitar string com letras', () => {
      const { req, res, next } = createMocks({ documento: '123abc456' });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].mensagem).toContain('apenas dígitos');
    });

    it('deve rejeitar string com caracteres especiais', () => {
      const { req, res, next } = createMocks({ documento: '123.456.789-01' });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('custom validator', () => {
    const schema = {
      documento: {
        required: true,
        type: 'string',
        format: 'digits',
        custom: (v) => (v.length === 11 || v.length === 14) || "Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos"
      }
    };
    const validate = validationMiddleware(schema);

    it('deve aceitar CPF com 11 dígitos', () => {
      const { req, res, next } = createMocks({ documento: '12345678901' });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve aceitar CNPJ com 14 dígitos', () => {
      const { req, res, next } = createMocks({ documento: '12345678901234' });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve rejeitar documento com tamanho inválido', () => {
      const { req, res, next } = createMocks({ documento: '123456789' });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors[0].mensagem).toContain('11 (CPF) ou 14 (CNPJ)');
    });
  });

  describe('múltiplos campos', () => {
    const schema = {
      nome_completo: { required: true, type: 'string', minLength: 3, maxLength: 150 },
      email: { required: true, type: 'string', format: 'email', maxLength: 255 },
      telefone: { required: true, type: 'string', format: 'digits', minLength: 10, maxLength: 11 }
    };
    const validate = validationMiddleware(schema);

    it('deve retornar múltiplos erros quando vários campos são inválidos', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'ab',
        email: 'invalido',
        telefone: '123'
      });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.errors.length).toBeGreaterThanOrEqual(3);
      expect(next).not.toHaveBeenCalled();
    });

    it('deve aceitar todos os campos válidos', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João da Silva',
        email: 'joao@example.com',
        telefone: '11987654321'
      });
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve retornar erros apenas para campos inválidos', () => {
      const { req, res, next } = createMocks({
        nome_completo: 'João da Silva',
        email: 'invalido',
        telefone: '11987654321'
      });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      const campos = res.jsonData.errors.map(e => e.campo);
      expect(campos).toContain('email');
      expect(campos).not.toContain('nome_completo');
      expect(campos).not.toContain('telefone');
    });
  });

  describe('source parameter', () => {
    it('deve validar req.params quando source é params', () => {
      const schema = { id: { required: true, type: 'string' } };
      const validate = validationMiddleware(schema, 'params');
      const { req, res, next } = createMocks({}, 'body');
      req.params = { id: 'abc123' };
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve validar req.query quando source é query', () => {
      const schema = { page: { required: true, type: 'string' } };
      const validate = validationMiddleware(schema, 'query');
      const { req, res, next } = createMocks({}, 'body');
      req.query = { page: '1' };
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('campos opcionais', () => {
    const schema = {
      comentario: { type: 'string', maxLength: 500 }
    };
    const validate = validationMiddleware(schema);

    it('deve aceitar campo ausente quando não é required', () => {
      const { req, res, next } = createMocks({});
      validate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve validar campo opcional quando presente', () => {
      const { req, res, next } = createMocks({ comentario: 'a'.repeat(501) });
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('formato de resposta de erro', () => {
    it('deve retornar status 400 com array de errors contendo campo e mensagem', () => {
      const schema = { nome: { required: true } };
      const validate = validationMiddleware(schema);
      const { req, res, next } = createMocks({});
      validate(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toHaveProperty('errors');
      expect(Array.isArray(res.jsonData.errors)).toBe(true);
      expect(res.jsonData.errors[0]).toHaveProperty('campo');
      expect(res.jsonData.errors[0]).toHaveProperty('mensagem');
    });

    it('mensagens devem estar em português', () => {
      const schema = {
        nome: { required: true, type: 'string', minLength: 3 }
      };
      const validate = validationMiddleware(schema);
      const { req, res, next } = createMocks({ nome: 'ab' });
      validate(req, res, next);
      // Verifica que a mensagem contém palavras em português
      expect(res.jsonData.errors[0].mensagem).toMatch(/campo|mínimo|máximo|obrigatório|tipo|dígitos|válido/);
    });
  });
});
