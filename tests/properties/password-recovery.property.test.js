const fc = require('fast-check');
const bcrypt = require('bcryptjs');

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

const authController = require('../../src/controllers/authController');
const sql = require('../../src/config/db');

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

// --- Arbitraries ---

const validEmail = fc.tuple(
  stringFromChars(ALNUM_LOWER, 1, 15),
  stringFromChars(LOWER, 1, 10),
  stringFromChars(LOWER, 2, 5)
).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// Valid password meeting policy: min 8 chars, 1 uppercase, 1 lowercase, 1 digit
const validPassword = fc.tuple(
  stringFromChars(LOWER, 3, 50),
  stringFromChars(UPPER, 1, 10),
  stringFromChars(DIGITS, 1, 10)
).map(([lower, upper, digits]) => lower + upper + digits)
  .filter(s => s.length >= 8 && s.length <= 128);

const validUserId = fc.uuid();

// ============================================================
// Property 8: Password recovery does not leak email existence
// ============================================================

describe('Property 8: Password recovery does not leak email existence', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * For ANY email (registered or unregistered), forgotPassword returns the same 200 response.
   * The response message is always "Se o email estiver cadastrado, você receberá instruções de recuperação".
   * This makes it impossible for the caller to determine whether the email exists.
   */

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear recovery tokens between tests
    authController._recoveryTokens.clear();
  });

  it('should return identical 200 response for any email regardless of registration status', async () => {
    const expectedMessage = 'Se o email estiver cadastrado, você receberá instruções de recuperação';

    await fc.assert(
      fc.asyncProperty(
        validEmail,
        validUserId,
        fc.boolean(),
        async (email, userId, emailExists) => {
          if (emailExists) {
            // Simulate registered user
            sql.mockImplementation(() => Promise.resolve([{ id: userId }]));
          } else {
            // Simulate unregistered email
            sql.mockImplementation(() => Promise.resolve([]));
          }

          const { req, res } = createMocks({ email });
          await authController.forgotPassword(req, res);

          // Always returns 200
          expect(res.statusCode).toBe(200);

          // Always returns the same message
          expect(res.jsonData).toEqual({ message: expectedMessage });
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('should return the exact same response structure for registered and unregistered emails', async () => {
    const expectedMessage = 'Se o email estiver cadastrado, você receberá instruções de recuperação';

    await fc.assert(
      fc.asyncProperty(
        validEmail,
        validEmail,
        validUserId,
        async (registeredEmail, unregisteredEmail) => {
          // First call: registered email
          sql.mockImplementation(() => Promise.resolve([{ id: 'user-123' }]));
          const { req: req1, res: res1 } = createMocks({ email: registeredEmail });
          await authController.forgotPassword(req1, res1);

          // Second call: unregistered email
          sql.mockImplementation(() => Promise.resolve([]));
          const { req: req2, res: res2 } = createMocks({ email: unregisteredEmail });
          await authController.forgotPassword(req2, res2);

          // Both responses must be identical in structure and content
          expect(res1.statusCode).toBe(res2.statusCode);
          expect(res1.jsonData).toEqual(res2.jsonData);
          expect(res1.jsonData).toEqual({ message: expectedMessage });
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);
});

// ============================================================
// Property 9: Password reset with valid token updates hash and invalidates sessions
// ============================================================

describe('Property 9: Password reset with valid token updates hash and invalidates sessions', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any valid recovery token and new password meeting policy, resetPassword should:
   * - Return 200 with "Senha atualizada com sucesso"
   * - Mark the token as used (so it can't be reused)
   * - Call sql to update the password hash
   * For expired/used/invalid tokens, return 400.
   */

  beforeEach(() => {
    jest.clearAllMocks();
    authController._recoveryTokens.clear();
  });

  it('should return 200 and update password hash for any valid token and policy-compliant password', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPassword,
        validUserId,
        async (novaSenha, userId) => {
          // Set up a valid recovery token
          const token = 'valid-token-' + Math.random().toString(36).substring(2);
          authController._recoveryTokens.set(token, {
            token,
            usuario_id: userId,
            expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 min from now
            used: false
          });

          // Mock sql for the UPDATE query
          sql.mockImplementation(() => Promise.resolve([]));

          const { req, res } = createMocks({ token, nova_senha: novaSenha });
          await authController.resetPassword(req, res);

          // Should return 200
          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toEqual({ message: 'Senha atualizada com sucesso' });

          // Token should be marked as used
          const tokenEntry = authController._recoveryTokens.get(token);
          expect(tokenEntry.used).toBe(true);

          // sql should have been called to update the password hash
          expect(sql).toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  }, 60000);

  it('should invalidate token so it cannot be reused', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPassword,
        validUserId,
        async (novaSenha, userId) => {
          // Set up a valid recovery token
          const token = 'reuse-token-' + Math.random().toString(36).substring(2);
          authController._recoveryTokens.set(token, {
            token,
            usuario_id: userId,
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
            used: false
          });

          sql.mockImplementation(() => Promise.resolve([]));

          // First reset: should succeed
          const { req: req1, res: res1 } = createMocks({ token, nova_senha: novaSenha });
          await authController.resetPassword(req1, res1);
          expect(res1.statusCode).toBe(200);

          // Second reset with same token: should fail (token already used)
          const { req: req2, res: res2 } = createMocks({ token, nova_senha: novaSenha });
          await authController.resetPassword(req2, res2);
          expect(res2.statusCode).toBe(400);
          expect(res2.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);

  it('should return 400 for expired tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPassword,
        validUserId,
        async (novaSenha, userId) => {
          // Set up an expired recovery token
          const token = 'expired-token-' + Math.random().toString(36).substring(2);
          authController._recoveryTokens.set(token, {
            token,
            usuario_id: userId,
            expires_at: new Date(Date.now() - 1000), // expired 1 second ago
            used: false
          });

          const { req, res } = createMocks({ token, nova_senha: novaSenha });
          await authController.resetPassword(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);

  it('should return 400 for invalid (non-existent) tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPassword,
        fc.string({ minLength: 10, maxLength: 64 }),
        async (novaSenha, randomToken) => {
          // Don't add any token to the store - token doesn't exist
          const { req, res } = createMocks({ token: randomToken, nova_senha: novaSenha });
          await authController.resetPassword(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);
});

// ============================================================
// Property 10: Password policy enforcement
// ============================================================

describe('Property 10: Password policy enforcement', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For any new password that doesn't meet policy (min 8 chars, 1 uppercase,
   * 1 lowercase, 1 digit), resetPassword should return 400.
   * Generate passwords missing various requirements and verify rejection.
   */

  beforeEach(() => {
    jest.clearAllMocks();
    authController._recoveryTokens.clear();
  });

  // Passwords missing uppercase
  const passwordNoUppercase = fc.tuple(
    stringFromChars(LOWER, 5, 50),
    stringFromChars(DIGITS, 1, 10)
  ).map(([lower, digits]) => lower + digits)
    .filter(s => s.length >= 8 && !/[A-Z]/.test(s));

  // Passwords missing lowercase
  const passwordNoLowercase = fc.tuple(
    stringFromChars(UPPER, 5, 50),
    stringFromChars(DIGITS, 1, 10)
  ).map(([upper, digits]) => upper + digits)
    .filter(s => s.length >= 8 && !/[a-z]/.test(s));

  // Passwords missing digits
  const passwordNoDigit = fc.tuple(
    stringFromChars(LOWER, 4, 50),
    stringFromChars(UPPER, 1, 10)
  ).map(([lower, upper]) => lower + upper)
    .filter(s => s.length >= 8 && !/\d/.test(s));

  // Passwords too short (less than 8 chars)
  const passwordTooShort = fc.tuple(
    stringFromChars(LOWER, 1, 3),
    stringFromChars(UPPER, 1, 2),
    stringFromChars(DIGITS, 1, 1)
  ).map(([lower, upper, digits]) => lower + upper + digits)
    .filter(s => s.length < 8);

  function setupValidToken(userId) {
    const token = 'policy-token-' + Math.random().toString(36).substring(2);
    authController._recoveryTokens.set(token, {
      token,
      usuario_id: userId,
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false
    });
    return token;
  }

  it('should return 400 for passwords missing uppercase letter', async () => {
    await fc.assert(
      fc.asyncProperty(
        passwordNoUppercase,
        validUserId,
        async (novaSenha, userId) => {
          const token = setupValidToken(userId);
          sql.mockImplementation(() => Promise.resolve([]));

          const { req, res } = createMocks({ token, nova_senha: novaSenha });
          await authController.resetPassword(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);

  it('should return 400 for passwords missing lowercase letter', async () => {
    await fc.assert(
      fc.asyncProperty(
        passwordNoLowercase,
        validUserId,
        async (novaSenha, userId) => {
          const token = setupValidToken(userId);
          sql.mockImplementation(() => Promise.resolve([]));

          const { req, res } = createMocks({ token, nova_senha: novaSenha });
          await authController.resetPassword(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);

  it('should return 400 for passwords missing digit', async () => {
    await fc.assert(
      fc.asyncProperty(
        passwordNoDigit,
        validUserId,
        async (novaSenha, userId) => {
          const token = setupValidToken(userId);
          sql.mockImplementation(() => Promise.resolve([]));

          const { req, res } = createMocks({ token, nova_senha: novaSenha });
          await authController.resetPassword(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);

  it('should return 400 for passwords shorter than 8 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        passwordTooShort,
        validUserId,
        async (novaSenha, userId) => {
          const token = setupValidToken(userId);
          sql.mockImplementation(() => Promise.resolve([]));

          const { req, res } = createMocks({ token, nova_senha: novaSenha });
          await authController.resetPassword(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);

  it('should return 200 for passwords meeting all policy requirements (positive control)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPassword,
        validUserId,
        async (novaSenha, userId) => {
          const token = setupValidToken(userId);
          sql.mockImplementation(() => Promise.resolve([]));

          const { req, res } = createMocks({ token, nova_senha: novaSenha });
          await authController.resetPassword(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toEqual({ message: 'Senha atualizada com sucesso' });
        }
      ),
      { numRuns: 30 }
    );
  }, 60000);
});
