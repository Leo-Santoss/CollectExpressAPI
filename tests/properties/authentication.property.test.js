const fc = require('fast-check');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock the db module BEFORE any controller imports (jest.mock is hoisted)
jest.mock('../../src/config/db', () => jest.fn());

// Mock rateLimitMiddleware
jest.mock('../../src/middlewares/rateLimitMiddleware', () => ({
  recordFailedAttempt: jest.fn(),
  resetAttempts: jest.fn(),
  getClientIp: jest.fn(() => '127.0.0.1'),
  rateLimitMiddleware: jest.fn((req, res, next) => next())
}));

// Set JWT secret for tests
process.env.JWT_SECRET = 'test-secret-key';

const validationMiddleware = require('../../src/middlewares/validationMiddleware');
const authController = require('../../src/controllers/authController');
const sql = require('../../src/config/db');

// Login validation schema (mirrors what the login route uses)
const loginSchema = {
  email: {
    required: true,
    type: 'string',
    format: 'email'
  },
  senha: {
    required: true,
    type: 'string',
    minLength: 8,
    maxLength: 128
  }
};

const validateLogin = validationMiddleware(loginSchema);

// --- Helper functions ---

function createMocks(body) {
  const req = { body, params: {}, query: {}, ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' } };
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

// --- Arbitraries for VALID values ---

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

const validTipoPerfil = fc.constantFrom('CONSUMIDOR', 'CACAMBEIRO', 'ADMIN');

const validUserId = fc.uuid();

// --- Arbitraries for INVALID values ---

// Invalid emails: missing @, no domain, wrong type, empty
const invalidEmail = fc.oneof(
  fc.constant(''),
  fc.constant('notanemail'),
  fc.constant('missing@'),
  fc.constant('@nodomain.com'),
  fc.constant('spaces in@email.com'),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer()
);

// Invalid senha: too short (<8), too long (>128), wrong type
const invalidSenha = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 7 }),  // too short
  fc.string({ minLength: 129, maxLength: 200 }), // too long
  fc.constant(null),
  fc.constant(undefined),
  fc.integer()
);

// ============================================================
// Property 5: Login returns JWT with correct payload
// ============================================================

describe('Property 5: Login returns JWT with correct payload', () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * For any registered user with valid credentials, the login response should contain
   * a JWT token. Decoded JWT should have `id` and `tipo_perfil` matching the user.
   * JWT expiration should be 24 hours (86400 seconds from iat).
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a JWT with correct id, tipo_perfil, and 24h expiration for any valid credentials', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmail,
        validSenha,
        validUserId,
        validTipoPerfil,
        async (email, senha, userId, tipoPerfil) => {
          // Hash the password to simulate a stored user
          const senhaHash = await bcrypt.hash(senha, 10);

          // Mock sql to return a user with the hashed password
          const fakeUser = {
            id: userId,
            nome_completo: 'Test User',
            email: email,
            senha_hash: senhaHash,
            tipo_perfil: tipoPerfil,
            documento: '12345678901',
            telefone: '11999999999',
            criado_em: new Date().toISOString()
          };

          sql.mockImplementation(() => Promise.resolve([fakeUser]));

          const { req, res } = createMocks({ email, senha });
          await authController.login(req, res);

          // Should return 200
          expect(res.statusCode).toBe(200);

          // Response should contain a token
          expect(res.jsonData).toHaveProperty('token');
          expect(typeof res.jsonData.token).toBe('string');
          expect(res.jsonData.token.length).toBeGreaterThan(0);

          // Decode the JWT and verify payload
          const decoded = jwt.verify(res.jsonData.token, process.env.JWT_SECRET);

          // JWT should contain id and tipo_perfil matching the user
          expect(decoded.id).toBe(userId);
          expect(decoded.tipo_perfil).toBe(tipoPerfil);

          // JWT expiration should be 24 hours (86400 seconds) from iat
          expect(decoded).toHaveProperty('iat');
          expect(decoded).toHaveProperty('exp');
          expect(decoded.exp - decoded.iat).toBe(86400);
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);
});

// ============================================================
// Property 6: Invalid credentials return generic error
// ============================================================

describe('Property 6: Invalid credentials return generic error', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * For any login attempt where email doesn't exist OR password doesn't match,
   * return 401. Error message must be EXACTLY "Credenciais inválidas".
   * The same message for both cases (no information leakage).
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 with "Credenciais inválidas" when email does not exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmail,
        validSenha,
        async (email, senha) => {
          // Mock sql to return empty array (user not found)
          sql.mockImplementation(() => Promise.resolve([]));

          const { req, res } = createMocks({ email, senha });
          await authController.login(req, res);

          // Should return 401
          expect(res.statusCode).toBe(401);

          // Error message must be exactly "Credenciais inválidas"
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toBe('Credenciais inválidas');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('should return 401 with "Credenciais inválidas" when password does not match', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmail,
        validSenha,
        validUserId,
        validTipoPerfil,
        async (email, senha, userId, tipoPerfil) => {
          // Hash a DIFFERENT password to simulate wrong credentials
          const differentPassword = senha + 'WRONG';
          const senhaHash = await bcrypt.hash(differentPassword, 10);

          const fakeUser = {
            id: userId,
            nome_completo: 'Test User',
            email: email,
            senha_hash: senhaHash,
            tipo_perfil: tipoPerfil,
            documento: '12345678901',
            telefone: '11999999999',
            criado_em: new Date().toISOString()
          };

          sql.mockImplementation(() => Promise.resolve([fakeUser]));

          const { req, res } = createMocks({ email, senha });
          await authController.login(req, res);

          // Should return 401
          expect(res.statusCode).toBe(401);

          // Error message must be exactly "Credenciais inválidas" (same as non-existent email)
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toBe('Credenciais inválidas');
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);

  it('should return the same error message regardless of whether email exists or password is wrong (no information leakage)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmail,
        validSenha,
        validUserId,
        fc.boolean(),
        async (email, senha, userId, emailExists) => {
          if (emailExists) {
            // User exists but password is wrong
            const wrongHash = await bcrypt.hash(senha + 'DIFFERENT', 10);
            const fakeUser = {
              id: userId,
              nome_completo: 'Test User',
              email: email,
              senha_hash: wrongHash,
              tipo_perfil: 'CONSUMIDOR',
              documento: '12345678901',
              telefone: '11999999999',
              criado_em: new Date().toISOString()
            };
            sql.mockImplementation(() => Promise.resolve([fakeUser]));
          } else {
            // User does not exist
            sql.mockImplementation(() => Promise.resolve([]));
          }

          const { req, res } = createMocks({ email, senha });
          await authController.login(req, res);

          // Both cases should return identical response structure
          expect(res.statusCode).toBe(401);
          expect(res.jsonData).toEqual({ error: 'Credenciais inválidas' });
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);
});

// ============================================================
// Property 7: Login validation rejects malformed input
// ============================================================

describe('Property 7: Login validation rejects malformed input', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any email that doesn't conform to RFC 5322 format, the validation middleware
   * should reject with 400. For any senha outside 8-128 character range, the validation
   * middleware should reject with 400.
   */

  it('should return 400 when email does not conform to RFC 5322 format (senha is valid)', () => {
    fc.assert(
      fc.property(
        invalidEmail,
        validSenha,
        (email, senha) => {
          const { req, res, next } = createMocks({ email, senha });
          validateLogin(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('errors');
          expect(Array.isArray(res.jsonData.errors)).toBe(true);
          expect(res.jsonData.errors.length).toBeGreaterThanOrEqual(1);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('email');

          // Each error has campo and mensagem
          res.jsonData.errors.forEach(err => {
            expect(err).toHaveProperty('campo');
            expect(err).toHaveProperty('mensagem');
            expect(typeof err.mensagem).toBe('string');
          });

          // Validation should NOT call next (no authentication attempt)
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 400 when senha is outside 8-128 character range (email is valid)', () => {
    fc.assert(
      fc.property(
        validEmail,
        invalidSenha,
        (email, senha) => {
          const { req, res, next } = createMocks({ email, senha });
          validateLogin(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('errors');
          expect(Array.isArray(res.jsonData.errors)).toBe(true);
          expect(res.jsonData.errors.length).toBeGreaterThanOrEqual(1);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('senha');

          // Each error has campo and mensagem
          res.jsonData.errors.forEach(err => {
            expect(err).toHaveProperty('campo');
            expect(err).toHaveProperty('mensagem');
            expect(typeof err.mensagem).toBe('string');
          });

          // Validation should NOT call next (no authentication attempt)
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return 400 when both email and senha are malformed', () => {
    fc.assert(
      fc.property(
        invalidEmail,
        invalidSenha,
        (email, senha) => {
          const { req, res, next } = createMocks({ email, senha });
          validateLogin(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('errors');
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

          // Validation should NOT call next (no authentication attempt)
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should call next() and NOT return 400 when email and senha are valid', () => {
    fc.assert(
      fc.property(
        validEmail,
        validSenha,
        (email, senha) => {
          const { req, res, next } = createMocks({ email, senha });
          validateLogin(req, res, next);

          // Valid payloads should pass through to the controller
          expect(next).toHaveBeenCalled();
          expect(res.statusCode).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
