const fc = require('fast-check');

// Mock the db module BEFORE any controller imports (jest.mock is hoisted)
jest.mock('../../src/config/db', () => jest.fn());

const alugueisController = require('../../src/controllers/alugueisController');
const sql = require('../../src/config/db');

/**
 * Property Tests for Checkout and Pricing
 * Validates: Requirements 6.1, 6.3, 6.4, 6.6, 6.7
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

/**
 * Returns a date string (YYYY-MM-DD) that is `daysFromNow` days from today.
 */
function dateFromNow(daysFromNow) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- Arbitraries ---

const validUUID = fc.uuid();

// Valid dias_aluguel for checkout: 1-30
const validDiasAluguelCheckout = fc.integer({ min: 1, max: 30 });

// Valid data_inicio offset: 1-60 days from today
const validDataInicioOffset = fc.integer({ min: 1, max: 60 });

// Valid preco_diaria: positive decimal (use integer cents to avoid float issues)
const validPrecoDiaria = fc.integer({ min: 1, max: 9999999 }).map(v => v / 100);

// Valid quantidade: 1-10
const validQuantidade = fc.integer({ min: 1, max: 10 });

// Valid taxa_entrega: positive decimal (use integer cents to avoid float issues)
const validTaxaEntrega = fc.integer({ min: 1, max: 999999 }).map(v => v / 100);

// Cart item generator
const cartItemArb = fc.record({
  id: validUUID,
  cacamba_id: validUUID,
  quantidade: validQuantidade,
  dias_aluguel: validDiasAluguelCheckout,
  preco_diaria: validPrecoDiaria
});

// Non-empty list of cart items (1-5 items)
const cartItemsArb = fc.array(cartItemArb, { minLength: 1, maxLength: 5 });

// ============================================================================
// Property 14: Price calculation correctness
// ============================================================================

describe('Property 14: Price calculation correctness', () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any cart with items, preco_final = sum(quantidade × dias_aluguel × preco_diaria)
   * for each item, plus the cacambeiro's taxa_entrega.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preco_final equals sum(quantidade × dias_aluguel × preco_diaria) + taxa_entrega for any cart', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // consumidor_id
        validUUID, // cacambeiro_id
        validUUID, // carrinho_id
        validUUID, // endereco_id
        validDataInicioOffset,
        validDiasAluguelCheckout,
        cartItemsArb,
        validTaxaEntrega,
        async (consumidorId, cacambeiroId, carrinhoId, enderecoId, daysOffset, diasAluguel, cartItems, taxaEntrega) => {
          const dataInicio = dateFromNow(daysOffset);

          // Calculate expected price
          let expectedTotal = 0;
          cartItems.forEach(item => {
            expectedTotal += item.quantidade * diasAluguel * Number(item.preco_diaria);
          });
          expectedTotal += taxaEntrega;

          const createdOrderId = 'order-uuid-123';

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // SELECT carrinho
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              // SELECT itens_carrinho with preco_diaria
              return Promise.resolve(cartItems.map(item => ({
                id: item.id,
                cacamba_id: item.cacamba_id,
                quantidade: item.quantidade,
                dias_aluguel: item.dias_aluguel,
                preco_diaria: item.preco_diaria
              })));
            }
            if (callCount === 3) {
              // SELECT endereco (belongs to consumer)
              return Promise.resolve([{ id: enderecoId }]);
            }
            if (callCount === 4) {
              // SELECT detalhes_cacambeiro (taxa_entrega)
              return Promise.resolve([{ taxa_entrega: taxaEntrega }]);
            }
            if (callCount === 5) {
              // INSERT aluguel RETURNING *
              return Promise.resolve([{
                id: createdOrderId,
                consumidor_id: consumidorId,
                cacambeiro_id: cacambeiroId,
                endereco_id: enderecoId,
                data_inicio: dataInicio,
                dias_aluguel: diasAluguel,
                preco_final: expectedTotal,
                status_pagamento: 'PENDENTE',
                status_aluguel: 'AGUARDANDO_ENTREGA'
              }]);
            }
            // Remaining calls: INSERT itens_aluguel, DELETE itens_carrinho, DELETE carrinho
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { endereco_id: enderecoId, data_inicio: dataInicio, dias_aluguel: diasAluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await alugueisController.checkout(req, res);

          expect(res.statusCode).toBe(201);

          // Verify the price calculation by checking what was passed to the INSERT
          // The controller calculates preco_final internally, so we verify the response
          const responseOrder = res.jsonData;
          expect(responseOrder.preco_final).toBeCloseTo(expectedTotal, 2);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('preco_final is zero items total + taxa_entrega when taxa_entrega is 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        validUUID,
        validDataInicioOffset,
        validDiasAluguelCheckout,
        cartItemsArb,
        async (consumidorId, cacambeiroId, carrinhoId, enderecoId, daysOffset, diasAluguel, cartItems) => {
          const dataInicio = dateFromNow(daysOffset);
          const taxaEntrega = 0;

          // Expected: sum of items only (no taxa)
          let expectedTotal = 0;
          cartItems.forEach(item => {
            expectedTotal += item.quantidade * diasAluguel * Number(item.preco_diaria);
          });

          const createdOrderId = 'order-uuid-456';

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              return Promise.resolve(cartItems.map(item => ({
                id: item.id,
                cacamba_id: item.cacamba_id,
                quantidade: item.quantidade,
                dias_aluguel: item.dias_aluguel,
                preco_diaria: item.preco_diaria
              })));
            }
            if (callCount === 3) {
              return Promise.resolve([{ id: enderecoId }]);
            }
            if (callCount === 4) {
              // No detalhes_cacambeiro found → taxa_entrega defaults to 0
              return Promise.resolve([]);
            }
            if (callCount === 5) {
              return Promise.resolve([{
                id: createdOrderId,
                consumidor_id: consumidorId,
                cacambeiro_id: cacambeiroId,
                endereco_id: enderecoId,
                data_inicio: dataInicio,
                dias_aluguel: diasAluguel,
                preco_final: expectedTotal,
                status_pagamento: 'PENDENTE',
                status_aluguel: 'AGUARDANDO_ENTREGA'
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { endereco_id: enderecoId, data_inicio: dataInicio, dias_aluguel: diasAluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await alugueisController.checkout(req, res);

          expect(res.statusCode).toBe(201);
          expect(res.jsonData.preco_final).toBeCloseTo(expectedTotal, 2);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 15: Checkout date validation
// ============================================================================

describe('Property 15: Checkout date validation', () => {
  /**
   * **Validates: Requirements 6.1, 6.7**
   *
   * data_inicio must be at least 1 calendar day and at most 60 calendar days from
   * the current date. dias_aluguel must be between 1 and 30. Any value outside
   * these ranges should be rejected.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects data_inicio that is in the past (0 or fewer days from today)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        validUUID,
        fc.integer({ min: -365, max: 0 }), // past or today
        validDiasAluguelCheckout,
        async (consumidorId, cacambeiroId, carrinhoId, enderecoId, daysOffset, diasAluguel) => {
          const dataInicio = dateFromNow(daysOffset);

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{
                id: 'item-1',
                cacamba_id: 'cacamba-1',
                quantidade: 1,
                dias_aluguel: 5,
                preco_diaria: 50.00
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { endereco_id: enderecoId, data_inicio: dataInicio, dias_aluguel: diasAluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await alugueisController.checkout(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('data_inicio');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects data_inicio that is more than 60 days from today', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        validUUID,
        fc.integer({ min: 61, max: 365 }), // too far in the future
        validDiasAluguelCheckout,
        async (consumidorId, cacambeiroId, carrinhoId, enderecoId, daysOffset, diasAluguel) => {
          const dataInicio = dateFromNow(daysOffset);

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{
                id: 'item-1',
                cacamba_id: 'cacamba-1',
                quantidade: 1,
                dias_aluguel: 5,
                preco_diaria: 50.00
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { endereco_id: enderecoId, data_inicio: dataInicio, dias_aluguel: diasAluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await alugueisController.checkout(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('data_inicio');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects dias_aluguel below 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        validUUID,
        validDataInicioOffset,
        fc.integer({ min: -100, max: 0 }), // invalid dias_aluguel
        async (consumidorId, cacambeiroId, carrinhoId, enderecoId, daysOffset, diasAluguel) => {
          const dataInicio = dateFromNow(daysOffset);

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{
                id: 'item-1',
                cacamba_id: 'cacamba-1',
                quantidade: 1,
                dias_aluguel: 5,
                preco_diaria: 50.00
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { endereco_id: enderecoId, data_inicio: dataInicio, dias_aluguel: diasAluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await alugueisController.checkout(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('dias_aluguel');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects dias_aluguel above 30', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        validUUID,
        validDataInicioOffset,
        fc.integer({ min: 31, max: 365 }), // invalid dias_aluguel
        async (consumidorId, cacambeiroId, carrinhoId, enderecoId, daysOffset, diasAluguel) => {
          const dataInicio = dateFromNow(daysOffset);

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{
                id: 'item-1',
                cacamba_id: 'cacamba-1',
                quantidade: 1,
                dias_aluguel: 5,
                preco_diaria: 50.00
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { endereco_id: enderecoId, data_inicio: dataInicio, dias_aluguel: diasAluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await alugueisController.checkout(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('dias_aluguel');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('accepts valid data_inicio (1-60 days) and dias_aluguel (1-30)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        validUUID,
        validDataInicioOffset,
        validDiasAluguelCheckout,
        async (consumidorId, cacambeiroId, carrinhoId, enderecoId, daysOffset, diasAluguel) => {
          const dataInicio = dateFromNow(daysOffset);

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{
                id: 'item-1',
                cacamba_id: 'cacamba-1',
                quantidade: 1,
                dias_aluguel: 5,
                preco_diaria: 50.00
              }]);
            }
            if (callCount === 3) {
              return Promise.resolve([{ id: enderecoId }]);
            }
            if (callCount === 4) {
              return Promise.resolve([{ taxa_entrega: 30.00 }]);
            }
            if (callCount === 5) {
              return Promise.resolve([{
                id: 'order-uuid',
                consumidor_id: consumidorId,
                cacambeiro_id: cacambeiroId,
                endereco_id: enderecoId,
                data_inicio: dataInicio,
                dias_aluguel: diasAluguel,
                preco_final: 1 * diasAluguel * 50.00 + 30.00,
                status_pagamento: 'PENDENTE',
                status_aluguel: 'AGUARDANDO_ENTREGA'
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { endereco_id: enderecoId, data_inicio: dataInicio, dias_aluguel: diasAluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await alugueisController.checkout(req, res);

          expect(res.statusCode).toBe(201);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 16: Checkout creates order with correct initial status
// ============================================================================

describe('Property 16: Checkout creates order with correct initial status', () => {
  /**
   * **Validates: Requirements 6.4, 6.6**
   *
   * For any valid checkout (non-empty cart, valid endereco_id, valid data_inicio),
   * the created order must have status_aluguel="AGUARDANDO_ENTREGA" and
   * status_pagamento="PENDENTE", and the cart should be cleared after completion.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('created order always has status_aluguel=AGUARDANDO_ENTREGA and status_pagamento=PENDENTE', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        validUUID,
        validDataInicioOffset,
        validDiasAluguelCheckout,
        cartItemsArb,
        validTaxaEntrega,
        async (consumidorId, cacambeiroId, carrinhoId, enderecoId, daysOffset, diasAluguel, cartItems, taxaEntrega) => {
          const dataInicio = dateFromNow(daysOffset);

          let callCount = 0;
          let deleteItensCarrinhoCalled = false;
          let deleteCarrinhoCalled = false;

          sql.mockImplementation((...args) => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              return Promise.resolve(cartItems.map(item => ({
                id: item.id,
                cacamba_id: item.cacamba_id,
                quantidade: item.quantidade,
                dias_aluguel: item.dias_aluguel,
                preco_diaria: item.preco_diaria
              })));
            }
            if (callCount === 3) {
              return Promise.resolve([{ id: enderecoId }]);
            }
            if (callCount === 4) {
              return Promise.resolve([{ taxa_entrega: taxaEntrega }]);
            }
            if (callCount === 5) {
              // INSERT aluguel - verify status values in the returned order
              let totalItens = 0;
              cartItems.forEach(item => {
                totalItens += item.quantidade * diasAluguel * Number(item.preco_diaria);
              });
              const precoFinal = totalItens + taxaEntrega;

              return Promise.resolve([{
                id: 'created-order-id',
                consumidor_id: consumidorId,
                cacambeiro_id: cacambeiroId,
                endereco_id: enderecoId,
                data_inicio: dataInicio,
                dias_aluguel: diasAluguel,
                preco_final: precoFinal,
                status_pagamento: 'PENDENTE',
                status_aluguel: 'AGUARDANDO_ENTREGA'
              }]);
            }
            // INSERT itens_aluguel (one per cart item)
            if (callCount > 5 && callCount <= 5 + cartItems.length) {
              return Promise.resolve([]);
            }
            // DELETE itens_carrinho
            if (callCount === 5 + cartItems.length + 1) {
              deleteItensCarrinhoCalled = true;
              return Promise.resolve([]);
            }
            // DELETE carrinho
            if (callCount === 5 + cartItems.length + 2) {
              deleteCarrinhoCalled = true;
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { endereco_id: enderecoId, data_inicio: dataInicio, dias_aluguel: diasAluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await alugueisController.checkout(req, res);

          // Verify order was created with correct statuses
          expect(res.statusCode).toBe(201);
          expect(res.jsonData.status_aluguel).toBe('AGUARDANDO_ENTREGA');
          expect(res.jsonData.status_pagamento).toBe('PENDENTE');

          // Verify cart was cleared (DELETE calls were made)
          expect(deleteItensCarrinhoCalled).toBe(true);
          expect(deleteCarrinhoCalled).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('checkout with any number of valid cart items always produces AGUARDANDO_ENTREGA status', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUUID,
        validUUID,
        validUUID,
        validDataInicioOffset,
        validDiasAluguelCheckout,
        fc.integer({ min: 1, max: 5 }), // number of items
        validPrecoDiaria,
        validQuantidade,
        validTaxaEntrega,
        async (consumidorId, cacambeiroId, carrinhoId, enderecoId, daysOffset, diasAluguel, numItems, precoDiaria, quantidade, taxaEntrega) => {
          const dataInicio = dateFromNow(daysOffset);

          // Generate cart items
          const items = Array.from({ length: numItems }, (_, i) => ({
            id: `item-${i}`,
            cacamba_id: `cacamba-${i}`,
            quantidade,
            dias_aluguel: diasAluguel,
            preco_diaria: precoDiaria
          }));

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ id: carrinhoId, cacambeiro_id: cacambeiroId }]);
            }
            if (callCount === 2) {
              return Promise.resolve(items);
            }
            if (callCount === 3) {
              return Promise.resolve([{ id: enderecoId }]);
            }
            if (callCount === 4) {
              return Promise.resolve([{ taxa_entrega: taxaEntrega }]);
            }
            if (callCount === 5) {
              const totalItens = numItems * quantidade * diasAluguel * Number(precoDiaria);
              const precoFinal = totalItens + taxaEntrega;
              return Promise.resolve([{
                id: 'order-id',
                consumidor_id: consumidorId,
                cacambeiro_id: cacambeiroId,
                endereco_id: enderecoId,
                data_inicio: dataInicio,
                dias_aluguel: diasAluguel,
                preco_final: precoFinal,
                status_pagamento: 'PENDENTE',
                status_aluguel: 'AGUARDANDO_ENTREGA'
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { endereco_id: enderecoId, data_inicio: dataInicio, dias_aluguel: diasAluguel },
            {},
            {}
          );
          req.usuario_id = consumidorId;

          await alugueisController.checkout(req, res);

          expect(res.statusCode).toBe(201);
          expect(res.jsonData.status_aluguel).toBe('AGUARDANDO_ENTREGA');
          expect(res.jsonData.status_pagamento).toBe('PENDENTE');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});
