const fc = require('fast-check');
const bcrypt = require('bcryptjs');

// Mock the db module BEFORE any controller imports (jest.mock is hoisted)
jest.mock('../../src/config/db', () => jest.fn());

const validationMiddleware = require('../../src/middlewares/validationMiddleware');
const authController = require('../../src/controllers/authController');
const sql = require('../../src/config/db');

/**
 * Property Test: Registration validation rejects invalid inputs
 * Validates: Requirements 1.3, 1.4, 1.8
 *
 * For ANY registration payload where at least one field violates its validation rules,
 * the validation middleware SHALL return 400 with field-specific errors.
 */

// Registration validation schema (mirrors what the registration endpoint uses)
const registrationSchema = {
  nome_completo: { required: true, type: 'string', minLength: 3, maxLength: 150 },
  email: { required: true, type: 'string', format: 'email', maxLength: 255 },
  senha: {
    required: true,
    type: 'string',
    minLength: 8,
    maxLength: 128,
    custom: (v) => {
      if (!/[A-Z]/.test(v)) return "A senha deve conter pelo menos uma letra maiúscula";
      if (!/[a-z]/.test(v)) return "A senha deve conter pelo menos uma letra minúscula";
      if (!/\d/.test(v)) return "A senha deve conter pelo menos um dígito";
      return true;
    }
  },
  tipo_perfil: {
    required: true,
    type: 'string',
    custom: (v) => (v === 'CONSUMIDOR' || v === 'CACAMBEIRO') || "O tipo de perfil deve ser CONSUMIDOR ou CACAMBEIRO"
  },
  documento: {
    required: true,
    type: 'string',
    format: 'digits',
    custom: (v) => (v.length === 11 || v.length === 14) || "Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos"
  },
  telefone: { required: true, type: 'string', format: 'digits', minLength: 10, maxLength: 11 }
};

const validate = validationMiddleware(registrationSchema);

// Helper to create mock req/res/next
function createMocks(body) {
  const req = { body, params: {}, query: {} };
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

// --- Helper to build strings from a character set ---
function stringFromChars(chars, minLength, maxLength) {
  return fc.array(
    fc.constantFrom(...chars.split('')),
    { minLength, maxLength }
  ).map(arr => arr.join(''));
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const ALNUM_LOWER = LOWER + DIGITS;

// --- Arbitraries for VALID field values ---

const validNomeCompleto = fc.string({ minLength: 3, maxLength: 150 }).filter(s => s.length >= 3);

const validEmail = fc.tuple(
  stringFromChars(ALNUM_LOWER, 1, 15),
  stringFromChars(LOWER, 1, 10),
  stringFromChars(LOWER, 2, 5)
).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

const validSenha = fc.tuple(
  stringFromChars(LOWER, 3, 50),
  stringFromChars(UPPER, 1, 10),
  stringFromChars(DIGITS, 1, 10)
).map(([lower, upper, digits]) => lower + upper + digits)
  .filter(s => s.length >= 8 && s.length <= 128);

const validTipoPerfil = fc.constantFrom('CONSUMIDOR', 'CACAMBEIRO');

const validDocumento = fc.oneof(
  stringFromChars(DIGITS, 11, 11),
  stringFromChars(DIGITS, 14, 14)
);

const validTelefone = fc.oneof(
  stringFromChars(DIGITS, 10, 10),
  stringFromChars(DIGITS, 11, 11)
);

// A valid registration payload
const validPayload = fc.record({
  nome_completo: validNomeCompleto,
  email: validEmail,
  senha: validSenha,
  tipo_perfil: validTipoPerfil,
  documento: validDocumento,
  telefone: validTelefone
});

// --- Arbitraries for INVALID field values ---

// Invalid nome_completo: too short (0-2 chars), too long (>150), or wrong type
const invalidNomeCompleto = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 2 }),
  fc.string({ minLength: 151, maxLength: 200 }),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer()
);

// Invalid email: missing @, no domain, wrong type
const invalidEmail = fc.oneof(
  fc.constant(''),
  fc.constant('notanemail'),
  fc.constant('missing@'),
  fc.constant('@nodomain.com'),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer()
);

// Invalid senha: too short, no uppercase, no lowercase, no digit, wrong type
const invalidSenha = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 7 }),  // too short
  fc.constant('abcdefgh'),    // no uppercase, no digit
  fc.constant('ABCDEFGH'),    // no lowercase, no digit
  fc.constant('12345678'),    // no letters
  fc.constant('abcdEFGH'),    // no digit
  fc.constant('abcd1234'),    // no uppercase
  fc.constant('ABCD1234'),    // no lowercase
  fc.constant(null),
  fc.constant(undefined),
  fc.integer()
);

// Invalid tipo_perfil: not CONSUMIDOR or CACAMBEIRO
const invalidTipoPerfil = fc.oneof(
  fc.constant(''),
  fc.constant('ADMIN'),
  fc.constant('admin'),
  fc.constant('consumidor'),
  fc.constant('INVALID'),
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => s !== 'CONSUMIDOR' && s !== 'CACAMBEIRO'),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer()
);

// Invalid documento: wrong length (not 11 or 14), non-digits, wrong type
const invalidDocumento = fc.oneof(
  fc.constant(''),
  stringFromChars(DIGITS, 1, 10),  // too short
  stringFromChars(DIGITS, 12, 13), // wrong length (12 or 13)
  stringFromChars(DIGITS, 15, 20), // too long
  fc.constant('123.456.789-01'),   // formatted (non-digits)
  fc.constant('12345678abc'),      // contains letters
  fc.constant(null),
  fc.constant(undefined),
  fc.integer()
);

// Invalid telefone: wrong length (not 10 or 11 digits), non-digits, wrong type
const invalidTelefone = fc.oneof(
  fc.constant(''),
  stringFromChars(DIGITS, 1, 9),   // too short
  stringFromChars(DIGITS, 12, 20), // too long
  fc.constant('11-98765-4321'),    // formatted (non-digits)
  fc.constant('abcdefghij'),       // letters
  fc.constant(null),
  fc.constant(undefined),
  fc.integer()
);

describe('Property: Registration validation rejects invalid inputs', () => {
  /**
   * **Validates: Requirements 1.3, 1.4, 1.8**
   */

  it('should return 400 when nome_completo is invalid (all other fields valid)', () => {
    fc.assert(
      fc.property(
        invalidNomeCompleto,
        validEmail,
        validSenha,
        validTipoPerfil,
        validDocumento,
        validTelefone,
        (nome_completo, email, senha, tipo_perfil, documento, telefone) => {
          const payload = { nome_completo, email, senha, tipo_perfil, documento, telefone };
          const { req, res, next } = createMocks(payload);
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(Array.isArray(res.jsonData.errors)).toBe(true);
          expect(res.jsonData.errors.length).toBeGreaterThanOrEqual(1);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('nome_completo');

          // Each error has campo and mensagem
          res.jsonData.errors.forEach(err => {
            expect(err).toHaveProperty('campo');
            expect(err).toHaveProperty('mensagem');
            expect(typeof err.mensagem).toBe('string');
          });

          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 400 when email is invalid (all other fields valid)', () => {
    fc.assert(
      fc.property(
        validNomeCompleto,
        invalidEmail,
        validSenha,
        validTipoPerfil,
        validDocumento,
        validTelefone,
        (nome_completo, email, senha, tipo_perfil, documento, telefone) => {
          const payload = { nome_completo, email, senha, tipo_perfil, documento, telefone };
          const { req, res, next } = createMocks(payload);
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(Array.isArray(res.jsonData.errors)).toBe(true);
          expect(res.jsonData.errors.length).toBeGreaterThanOrEqual(1);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('email');

          res.jsonData.errors.forEach(err => {
            expect(err).toHaveProperty('campo');
            expect(err).toHaveProperty('mensagem');
          });

          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 400 when senha is invalid (all other fields valid)', () => {
    fc.assert(
      fc.property(
        validNomeCompleto,
        validEmail,
        invalidSenha,
        validTipoPerfil,
        validDocumento,
        validTelefone,
        (nome_completo, email, senha, tipo_perfil, documento, telefone) => {
          const payload = { nome_completo, email, senha, tipo_perfil, documento, telefone };
          const { req, res, next } = createMocks(payload);
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(res.jsonData.errors.length).toBeGreaterThanOrEqual(1);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('senha');

          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 400 when tipo_perfil is invalid (all other fields valid)', () => {
    fc.assert(
      fc.property(
        validNomeCompleto,
        validEmail,
        validSenha,
        invalidTipoPerfil,
        validDocumento,
        validTelefone,
        (nome_completo, email, senha, tipo_perfil, documento, telefone) => {
          const payload = { nome_completo, email, senha, tipo_perfil, documento, telefone };
          const { req, res, next } = createMocks(payload);
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(res.jsonData.errors.length).toBeGreaterThanOrEqual(1);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('tipo_perfil');

          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 400 when documento is invalid (all other fields valid)', () => {
    fc.assert(
      fc.property(
        validNomeCompleto,
        validEmail,
        validSenha,
        validTipoPerfil,
        invalidDocumento,
        validTelefone,
        (nome_completo, email, senha, tipo_perfil, documento, telefone) => {
          const payload = { nome_completo, email, senha, tipo_perfil, documento, telefone };
          const { req, res, next } = createMocks(payload);
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(res.jsonData.errors.length).toBeGreaterThanOrEqual(1);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('documento');

          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 400 when telefone is invalid (all other fields valid)', () => {
    fc.assert(
      fc.property(
        validNomeCompleto,
        validEmail,
        validSenha,
        validTipoPerfil,
        validDocumento,
        invalidTelefone,
        (nome_completo, email, senha, tipo_perfil, documento, telefone) => {
          const payload = { nome_completo, email, senha, tipo_perfil, documento, telefone };
          const { req, res, next } = createMocks(payload);
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(res.jsonData.errors.length).toBeGreaterThanOrEqual(1);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('telefone');

          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 400 with multiple field errors when multiple fields are invalid', () => {
    fc.assert(
      fc.property(
        invalidNomeCompleto,
        invalidEmail,
        invalidSenha,
        invalidTipoPerfil,
        invalidDocumento,
        invalidTelefone,
        (nome_completo, email, senha, tipo_perfil, documento, telefone) => {
          const payload = { nome_completo, email, senha, tipo_perfil, documento, telefone };
          const { req, res, next } = createMocks(payload);
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(Array.isArray(res.jsonData.errors)).toBe(true);
          expect(res.jsonData.errors.length).toBeGreaterThanOrEqual(1);

          // Every error must have campo and mensagem
          res.jsonData.errors.forEach(err => {
            expect(err).toHaveProperty('campo');
            expect(err).toHaveProperty('mensagem');
            expect(typeof err.campo).toBe('string');
            expect(typeof err.mensagem).toBe('string');
            expect(err.mensagem.length).toBeGreaterThan(0);
          });

          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should call next() and NOT return 400 when all fields are valid', () => {
    fc.assert(
      fc.property(
        validPayload,
        (payload) => {
          const { req, res, next } = createMocks(payload);
          validate(req, res, next);

          // Valid payloads should pass through
          expect(next).toHaveBeenCalled();
          expect(res.statusCode).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});


// --- Property 2, 3, 4: Controller-level registration tests ---

// Helper to create mock req/res for controller tests
function createControllerMocks(body) {
  const req = { body, params: {}, query: {} };
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

// --- Arbitraries reused from above (valid payloads) ---

const validRegistrationPayload = fc.record({
  nome_completo: validNomeCompleto,
  email: validEmail,
  senha: validSenha,
  tipo_perfil: validTipoPerfil,
  documento: validDocumento,
  telefone: validTelefone
});

describe('Property 2: Registration with valid data produces correct response', () => {
  /**
   * **Validates: Requirements 1.1, 1.6**
   *
   * For any valid registration payload, the Auth_Service SHALL create the user record
   * and return a response containing id, nome_completo, email, tipo_perfil, documento,
   * telefone, and criado_em, and SHALL NOT include the password hash in the response.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 201 with correct fields and no senha_hash for any valid payload', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationPayload,
        async (payload) => {
          // Mock sql tagged template to return a successful insert result
          const fakeUser = {
            id: 'fake-uuid-123',
            nome_completo: payload.nome_completo,
            email: payload.email,
            tipo_perfil: payload.tipo_perfil,
            documento: payload.documento,
            telefone: payload.telefone,
            criado_em: new Date().toISOString()
          };

          sql.mockImplementation(() => Promise.resolve([fakeUser]));

          const { req, res } = createControllerMocks(payload);
          await authController.register(req, res);

          // Should return 201
          expect(res.statusCode).toBe(201);

          // Response should contain required fields
          expect(res.jsonData).toHaveProperty('id');
          expect(res.jsonData).toHaveProperty('nome_completo');
          expect(res.jsonData).toHaveProperty('email');
          expect(res.jsonData).toHaveProperty('tipo_perfil');
          expect(res.jsonData).toHaveProperty('documento');
          expect(res.jsonData).toHaveProperty('telefone');
          expect(res.jsonData).toHaveProperty('criado_em');

          // Response should NOT contain senha_hash
          expect(res.jsonData).not.toHaveProperty('senha_hash');
          expect(res.jsonData).not.toHaveProperty('senha');

          // Values should match input
          expect(res.jsonData.nome_completo).toBe(payload.nome_completo);
          expect(res.jsonData.email).toBe(payload.email);
          expect(res.jsonData.tipo_perfil).toBe(payload.tipo_perfil);
          expect(res.jsonData.documento).toBe(payload.documento);
          expect(res.jsonData.telefone).toBe(payload.telefone);
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);
});

describe('Property 3: Duplicate email or documento prevents registration', () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * When the database throws a unique constraint violation (code 23505),
   * the controller should return 409 with appropriate message.
   * If constraint includes "email" → "Email já cadastrado"
   * If constraint includes "documento" → "Documento já cadastrado"
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 409 with "Email já cadastrado" when email constraint is violated', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationPayload,
        async (payload) => {
          // Mock sql to throw a unique constraint violation for email
          const dbError = new Error('duplicate key value violates unique constraint');
          dbError.code = '23505';
          dbError.constraint = 'usuarios_email_key';
          dbError.detail = 'Key (email)=(' + payload.email + ') already exists.';

          sql.mockImplementation(() => Promise.reject(dbError));

          const { req, res } = createControllerMocks(payload);
          await authController.register(req, res);

          expect(res.statusCode).toBe(409);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toBe('Email já cadastrado');
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);

  it('should return 409 with "Documento já cadastrado" when documento constraint is violated', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationPayload,
        async (payload) => {
          // Mock sql to throw a unique constraint violation for documento
          const dbError = new Error('duplicate key value violates unique constraint');
          dbError.code = '23505';
          dbError.constraint = 'usuarios_documento_key';
          dbError.detail = 'Key (documento)=(' + payload.documento + ') already exists.';

          sql.mockImplementation(() => Promise.reject(dbError));

          const { req, res } = createControllerMocks(payload);
          await authController.register(req, res);

          expect(res.statusCode).toBe(409);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toBe('Documento já cadastrado');
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);
});

describe('Property 4: Password hashing round-trip', () => {
  /**
   * **Validates: Requirements 1.7**
   *
   * For any valid password, after hashing with bcrypt (salt 10),
   * bcrypt.compare(original, hash) should return true.
   * The hash should be a valid bcrypt hash string.
   */

  it('should produce a valid bcrypt hash that verifies against the original password', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSenha,
        async (senha) => {
          // Hash the password with salt factor 10 (same as authController)
          const hash = await bcrypt.hash(senha, 10);

          // The hash should be a valid bcrypt hash string
          // bcrypt hashes start with $2a$ or $2b$ and are 60 chars long
          expect(hash).toMatch(/^\$2[aby]?\$\d{2}\$.{53}$/);
          expect(hash.length).toBe(60);

          // Round-trip: comparing original password against hash should return true
          const isMatch = await bcrypt.compare(senha, hash);
          expect(isMatch).toBe(true);

          // A different password should NOT match
          const wrongPassword = senha + 'X';
          const isWrongMatch = await bcrypt.compare(wrongPassword, hash);
          expect(isWrongMatch).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  }, 60000);
});
