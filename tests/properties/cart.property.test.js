const fc = require('fast-check');

// Mock the db module BEFORE any controller imports (jest.mock is hoisted)
jest.mock('../../src/config/db', () => jest.fn());

const carrinhoController = require('../../src/controllers/carrinhoController');
const sql = require('../../src/config/db');

/**
 * Property Tests for Cart Logic
 * Validates: Requirements 7.1, 7.2, 7.4, 7.5, 7.7
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
  return { req, res };
}

// --- Arbitraries ---

const validUUID = fc.uuid();

// Valid quantidade: integer between 1 and 10
const validQuantidade = fc.integer({ min: 1, max: 10 });

// Valid dias_aluguel: integer between 1 and 90
const validDiasAluguel = fc.integer({ min: 1, max: 90 });

// Invalid quantidade: integers outside 1-10
const invalidQuantidadeTooLow = fc.integer({ min: -100, max: 0 });
const invalidQuantidadeTooHigh = fc.integer({ min: 11, max: 1000 });

// Invalid dias_aluguel: integers outside 1-90
const invalidDiasAluguelTooLow = fc.integer({ min: -100, max: 0 });
const invalidDiasAluguelTooHigh = fc.integer({ min: 91, max: 1000 });

// ============================================================================
// Property 17: Cart enforces single-cacambeiro constraint
// ============================================================================

describe('Property 17: Cart enforces single-cacambeiro constraint', () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * For any cart containing items from cacambeiro A, attempting to add an item
   * from a different cacambeiro B should be rejected with 400.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects adding item from a different cacambeiro when cart already has items from another', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // consumidor_id
        validUUID, // cacambeiro_id_A (already in cart)
        validUUID, // cacambeiro_id_B (new item's cacambeiro)
        validUUID, // cacamba_id (new item)
        validUUID, // existing cart id
        validQuantidade,
        validDiasAluguel,
        async (consumidorId, cacambeiroA, cacambeiroB, cacambaId, carrinhoId, quantidade, dias_aluguel) => {
          // Ensure cacambeiros are different
          fc.pre(cacambeiroA !== cacambeiroB);

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // First call: SELECT cacamba to get its cacambeiro_id
              return Promise.resolve([{ id: cacambaId, cacambeiro_id: cacambeiroB }]);
            }
            if (callCount === 2) {
              // Second call: SELECT existing cart (belongs to cacambeiroA)
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroA }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { cacamba_id: cacambaId, quantidade, dias_aluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await carrinhoController.adicionarItem(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('mesmo caçambeiro');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('allows adding item from the same cacambeiro that is already in the cart', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // consumidor_id
        validUUID, // cacambeiro_id (same for both)
        validUUID, // cacamba_id
        validUUID, // existing cart id
        validQuantidade,
        validDiasAluguel,
        async (consumidorId, cacambeiroId, cacambaId, carrinhoId, quantidade, dias_aluguel) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // First call: SELECT cacamba to get its cacambeiro_id
              return Promise.resolve([{ id: cacambaId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              // Second call: SELECT existing cart (same cacambeiro)
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 3) {
              // Third call: INSERT item into cart
              return Promise.resolve([]);
            }
            if (callCount === 4) {
              // Fourth call: SELECT itens for response
              return Promise.resolve([{
                id: 'item-uuid',
                cacamba_id: cacambaId,
                quantidade,
                dias_aluguel,
                nome: 'Caçamba Teste',
                tipo_residuo: 'Entulho',
                preco_diaria: 50.00
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { cacamba_id: cacambaId, quantidade, dias_aluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await carrinhoController.adicionarItem(req, res);

          expect(res.statusCode).toBe(201);
          expect(res.jsonData).toHaveProperty('cacambeiro_id', cacambeiroId);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 18: Cart item quantity and duration constraints
// ============================================================================

describe('Property 18: Cart item quantity and duration constraints', () => {
  /**
   * **Validates: Requirements 7.1, 7.4, 7.7**
   *
   * For any cart item operation (add or update), quantidade must be between 1 and 10,
   * and dias_aluguel must be between 1 and 90. Values outside these ranges should be
   * rejected with 400.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects adicionarItem when quantidade is below 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        invalidQuantidadeTooLow,
        validDiasAluguel,
        async (consumidorId, cacambaId, quantidade, dias_aluguel) => {
          const { req, res } = createMocks(
            { cacamba_id: cacambaId, quantidade, dias_aluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await carrinhoController.adicionarItem(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('quantidade');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects adicionarItem when quantidade is above 10', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        invalidQuantidadeTooHigh,
        validDiasAluguel,
        async (consumidorId, cacambaId, quantidade, dias_aluguel) => {
          const { req, res } = createMocks(
            { cacamba_id: cacambaId, quantidade, dias_aluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await carrinhoController.adicionarItem(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('quantidade');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects adicionarItem when dias_aluguel is below 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validQuantidade,
        invalidDiasAluguelTooLow,
        async (consumidorId, cacambaId, quantidade, dias_aluguel) => {
          const { req, res } = createMocks(
            { cacamba_id: cacambaId, quantidade, dias_aluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await carrinhoController.adicionarItem(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('dias_aluguel');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects adicionarItem when dias_aluguel is above 90', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validQuantidade,
        invalidDiasAluguelTooHigh,
        async (consumidorId, cacambaId, quantidade, dias_aluguel) => {
          const { req, res } = createMocks(
            { cacamba_id: cacambaId, quantidade, dias_aluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await carrinhoController.adicionarItem(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('dias_aluguel');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects atualizarItem when quantidade is below 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        invalidQuantidadeTooLow,
        async (consumidorId, itemId, quantidade) => {
          const { req, res } = createMocks(
            { quantidade },
            { id: itemId },
            {}
          );
          req.usuario_id = consumidorId;

          await carrinhoController.atualizarItem(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('quantidade');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects atualizarItem when quantidade is above 10', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        invalidQuantidadeTooHigh,
        async (consumidorId, itemId, quantidade) => {
          const { req, res } = createMocks(
            { quantidade },
            { id: itemId },
            {}
          );
          req.usuario_id = consumidorId;

          await carrinhoController.atualizarItem(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('quantidade');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('accepts adicionarItem when quantidade and dias_aluguel are within valid ranges', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        validQuantidade,
        validDiasAluguel,
        async (consumidorId, cacambaId, cacambeiroId, quantidade, dias_aluguel) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // SELECT cacamba
              return Promise.resolve([{ id: cacambaId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              // SELECT existing cart (none found, create new)
              return Promise.resolve([]);
            }
            if (callCount === 3) {
              // INSERT new cart
              return Promise.resolve([{ id: 'new-cart-uuid', cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 4) {
              // INSERT item
              return Promise.resolve([]);
            }
            if (callCount === 5) {
              // SELECT itens for response
              return Promise.resolve([{
                id: 'item-uuid',
                cacamba_id: cacambaId,
                quantidade,
                dias_aluguel,
                nome: 'Caçamba Teste',
                tipo_residuo: 'Entulho',
                preco_diaria: 50.00
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { cacamba_id: cacambaId, quantidade, dias_aluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await carrinhoController.adicionarItem(req, res);

          expect(res.statusCode).toBe(201);
          expect(res.jsonData).toHaveProperty('itens');
          expect(res.jsonData.itens[0].quantidade).toBe(quantidade);
          expect(res.jsonData.itens[0].dias_aluguel).toBe(dias_aluguel);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 19: Cart clear removes all items
// ============================================================================

describe('Property 19: Cart clear removes all items', () => {
  /**
   * **Validates: Requirements 7.5**
   *
   * After clearing a non-empty cart, the response should indicate success
   * with "Carrinho limpo com sucesso".
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clearing a non-empty cart returns success message', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // consumidor_id
        validUUID, // carrinho_id
        fc.integer({ min: 1, max: 20 }), // number of items (non-empty cart)
        async (consumidorId, carrinhoId, itemCount) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // SELECT carrinho
              return Promise.resolve([{ id: carrinhoId }]);
            }
            if (callCount === 2) {
              // DELETE itens_carrinho
              return Promise.resolve([]);
            }
            if (callCount === 3) {
              // DELETE carrinho
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, {}, {});
          req.usuario_id = consumidorId;

          await carrinhoController.limpar(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toHaveProperty('message');
          expect(res.jsonData.message).toBe('Carrinho limpo com sucesso');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('clearing an empty cart (no carrinho record) also returns success message', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // consumidor_id
        async (consumidorId) => {
          sql.mockImplementation(() => {
            // SELECT carrinho returns empty (no cart exists)
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, {}, {});
          req.usuario_id = consumidorId;

          await carrinhoController.limpar(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toHaveProperty('message');
          expect(res.jsonData.message).toBe('Carrinho limpo com sucesso');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});
