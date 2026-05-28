const fc = require('fast-check');

// Mock the db module BEFORE any controller imports (jest.mock is hoisted)
jest.mock('../../src/config/db', () => jest.fn());

const validationMiddleware = require('../../src/middlewares/validationMiddleware');
const cacambasController = require('../../src/controllers/cacambasController');
const sql = require('../../src/config/db');

/**
 * Property Tests for Dumpster CRUD
 * Validates: Requirements 10.1, 10.2, 10.3, 10.5, 10.6
 */

// --- Helpers ---

function createMocks(body = {}, params = {}, query = {}) {
  const req = { body, params, query };
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

// --- Arbitraries ---

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const ALNUM = LOWER + UPPER + DIGITS;

function stringFromChars(chars, minLength, maxLength) {
  return fc.array(
    fc.constantFrom(...chars.split('')),
    { minLength, maxLength }
  ).map(arr => arr.join(''));
}

// Valid UUID-like IDs
const validUUID = fc.uuid();

// Valid dumpster payload fields
const validNome = stringFromChars(ALNUM + ' ', 1, 100).filter(s => s.trim().length >= 1);
const validTipoResiduo = stringFromChars(ALNUM + ' ', 1, 50).filter(s => s.trim().length >= 1);
const validTamanhoM3 = fc.double({ min: 0.01, max: 999.99, noNaN: true }).map(v => Math.round(v * 100) / 100);
const validPrecoDiaria = fc.double({ min: 0.01, max: 99999999.99, noNaN: true }).map(v => Math.round(v * 100) / 100);

// Dumpster creation validation schema (mirrors cacambasRoutes.js)
const criarCacambaSchema = {
  nome: {
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 100
  },
  tipo_residuo: {
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 50
  },
  tamanho_m3: {
    required: true,
    type: 'number',
    min: 0.01,
    max: 999.99
  },
  preco_diaria: {
    required: true,
    type: 'number',
    min: 0.01,
    max: 99999999.99
  }
};

const validate = validationMiddleware(criarCacambaSchema);

// ============================================================================
// Property 23: Dumpster CRUD ownership isolation
// ============================================================================

describe('Property 23: Dumpster CRUD ownership isolation', () => {
  /**
   * **Validates: Requirements 10.1, 10.2**
   *
   * For any cacambeiro, creating a dumpster should set cacambeiro_id to the
   * authenticated user's id. Updating/deleting should only work for the owner
   * (403 for non-owners).
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creating a dumpster sets cacambeiro_id to the authenticated user id', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validNome,
        validTipoResiduo,
        validTamanhoM3,
        validPrecoDiaria,
        async (userId, nome, tipo_residuo, tamanho_m3, preco_diaria) => {
          const fakeResult = {
            id: 'new-dumpster-uuid',
            cacambeiro_id: userId,
            nome,
            tipo_residuo,
            tamanho_m3,
            preco_diaria,
            foto_url: null,
            disponivel: true,
            criado_em: new Date().toISOString()
          };

          sql.mockImplementation(() => Promise.resolve([fakeResult]));

          const { req, res } = createMocks(
            { nome, tipo_residuo, tamanho_m3, preco_diaria },
            {},
            {}
          );
          req.usuario_id = userId;

          await cacambasController.criar(req, res);

          expect(res.statusCode).toBe(201);
          expect(res.jsonData.cacambeiro_id).toBe(userId);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('updating a dumpster returns 403 when user is not the owner', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        validPrecoDiaria,
        async (dumpsterId, ownerId, nonOwnerId, newPreco) => {
          // Ensure owner and non-owner are different
          fc.pre(ownerId !== nonOwnerId);

          // Mock: dumpster exists and belongs to ownerId
          const existingDumpster = {
            id: dumpsterId,
            cacambeiro_id: ownerId,
            nome: 'Test Dumpster',
            tipo_residuo: 'Entulho',
            tamanho_m3: 5.0,
            preco_diaria: 100.0,
            disponivel: true
          };

          sql.mockImplementation(() => Promise.resolve([existingDumpster]));

          const { req, res } = createMocks(
            { preco_diaria: newPreco },
            { id: dumpsterId },
            {}
          );
          req.usuario_id = nonOwnerId;

          await cacambasController.atualizar(req, res);

          expect(res.statusCode).toBe(403);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('deleting a dumpster returns 403 when user is not the owner', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        async (dumpsterId, ownerId, nonOwnerId) => {
          // Ensure owner and non-owner are different
          fc.pre(ownerId !== nonOwnerId);

          // Mock: dumpster exists and belongs to ownerId
          const existingDumpster = {
            id: dumpsterId,
            cacambeiro_id: ownerId,
            nome: 'Test Dumpster',
            tipo_residuo: 'Entulho',
            tamanho_m3: 5.0,
            preco_diaria: 100.0,
            disponivel: true
          };

          sql.mockImplementation(() => Promise.resolve([existingDumpster]));

          const { req, res } = createMocks(
            {},
            { id: dumpsterId },
            {}
          );
          req.usuario_id = nonOwnerId;

          await cacambasController.remover(req, res);

          expect(res.statusCode).toBe(403);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 24: Dumpster deletion constraint
// ============================================================================

describe('Property 24: Dumpster deletion constraint', () => {
  /**
   * **Validates: Requirements 10.5, 10.6**
   *
   * Deletion should succeed only when no active orders exist.
   * If active orders exist (count > 0), deletion should be rejected with 400.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletion is rejected with 400 when active orders exist (count > 0)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        fc.integer({ min: 1, max: 100 }),
        async (dumpsterId, ownerId, activeOrderCount) => {
          const existingDumpster = {
            id: dumpsterId,
            cacambeiro_id: ownerId,
            nome: 'Test Dumpster',
            tipo_residuo: 'Entulho',
            tamanho_m3: 5.0,
            preco_diaria: 100.0,
            disponivel: true
          };

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // First call: SELECT dumpster
              return Promise.resolve([existingDumpster]);
            }
            if (callCount === 2) {
              // Second call: COUNT active orders
              return Promise.resolve([{ count: activeOrderCount }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            {},
            { id: dumpsterId },
            {}
          );
          req.usuario_id = ownerId;

          await cacambasController.remover(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('pedidos ativos');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('deletion succeeds with 200 when no active orders exist (count = 0)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        async (dumpsterId, ownerId) => {
          const existingDumpster = {
            id: dumpsterId,
            cacambeiro_id: ownerId,
            nome: 'Test Dumpster',
            tipo_residuo: 'Entulho',
            tamanho_m3: 5.0,
            preco_diaria: 100.0,
            disponivel: true
          };

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // First call: SELECT dumpster
              return Promise.resolve([existingDumpster]);
            }
            if (callCount === 2) {
              // Second call: COUNT active orders = 0
              return Promise.resolve([{ count: 0 }]);
            }
            if (callCount === 3) {
              // Third call: DELETE
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            {},
            { id: dumpsterId },
            {}
          );
          req.usuario_id = ownerId;

          await cacambasController.remover(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toHaveProperty('message');
          expect(res.jsonData.message).toContain('removida com sucesso');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 25: Dumpster validation rejects invalid data
// ============================================================================

describe('Property 25: Dumpster validation rejects invalid data', () => {
  /**
   * **Validates: Requirements 10.3**
   *
   * For any dumpster creation payload where nome > 100 chars, tipo_residuo > 50 chars,
   * tamanho_m3 outside 0.01-999.99, or preco_diaria outside 0.01-99999999.99,
   * the validation middleware should reject with 400.
   */

  it('rejects when nome exceeds 100 characters', () => {
    fc.assert(
      fc.property(
        stringFromChars(ALNUM, 101, 200),
        validTipoResiduo,
        validTamanhoM3,
        validPrecoDiaria,
        (nome, tipo_residuo, tamanho_m3, preco_diaria) => {
          const { req, res, next } = createMocks({ nome, tipo_residuo, tamanho_m3, preco_diaria });
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(Array.isArray(res.jsonData.errors)).toBe(true);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('nome');
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects when tipo_residuo exceeds 50 characters', () => {
    fc.assert(
      fc.property(
        validNome,
        stringFromChars(ALNUM, 51, 100),
        validTamanhoM3,
        validPrecoDiaria,
        (nome, tipo_residuo, tamanho_m3, preco_diaria) => {
          const { req, res, next } = createMocks({ nome, tipo_residuo, tamanho_m3, preco_diaria });
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(Array.isArray(res.jsonData.errors)).toBe(true);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('tipo_residuo');
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects when tamanho_m3 is below 0.01', () => {
    fc.assert(
      fc.property(
        validNome,
        validTipoResiduo,
        fc.double({ min: -1000, max: 0.009, noNaN: true }),
        validPrecoDiaria,
        (nome, tipo_residuo, tamanho_m3, preco_diaria) => {
          const { req, res, next } = createMocks({ nome, tipo_residuo, tamanho_m3, preco_diaria });
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(Array.isArray(res.jsonData.errors)).toBe(true);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('tamanho_m3');
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects when tamanho_m3 is above 999.99', () => {
    fc.assert(
      fc.property(
        validNome,
        validTipoResiduo,
        fc.double({ min: 1000, max: 100000, noNaN: true }),
        validPrecoDiaria,
        (nome, tipo_residuo, tamanho_m3, preco_diaria) => {
          const { req, res, next } = createMocks({ nome, tipo_residuo, tamanho_m3, preco_diaria });
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(Array.isArray(res.jsonData.errors)).toBe(true);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('tamanho_m3');
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects when preco_diaria is below 0.01', () => {
    fc.assert(
      fc.property(
        validNome,
        validTipoResiduo,
        validTamanhoM3,
        fc.double({ min: -100000, max: 0.009, noNaN: true }),
        (nome, tipo_residuo, tamanho_m3, preco_diaria) => {
          const { req, res, next } = createMocks({ nome, tipo_residuo, tamanho_m3, preco_diaria });
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(Array.isArray(res.jsonData.errors)).toBe(true);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('preco_diaria');
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects when preco_diaria is above 99999999.99', () => {
    fc.assert(
      fc.property(
        validNome,
        validTipoResiduo,
        validTamanhoM3,
        fc.double({ min: 100000000, max: 999999999, noNaN: true }),
        (nome, tipo_residuo, tamanho_m3, preco_diaria) => {
          const { req, res, next } = createMocks({ nome, tipo_residuo, tamanho_m3, preco_diaria });
          validate(req, res, next);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.errors).toBeDefined();
          expect(Array.isArray(res.jsonData.errors)).toBe(true);

          const campos = res.jsonData.errors.map(e => e.campo);
          expect(campos).toContain('preco_diaria');
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('passes validation when all fields are within valid ranges', () => {
    fc.assert(
      fc.property(
        validNome,
        validTipoResiduo,
        validTamanhoM3,
        validPrecoDiaria,
        (nome, tipo_residuo, tamanho_m3, preco_diaria) => {
          const { req, res, next } = createMocks({ nome, tipo_residuo, tamanho_m3, preco_diaria });
          validate(req, res, next);

          expect(next).toHaveBeenCalled();
          expect(res.statusCode).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });
});
