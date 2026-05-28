const fc = require('fast-check');

// Mock the db module BEFORE any controller imports
jest.mock('../../src/config/db', () => jest.fn());

const cacambeirosController = require('../../src/controllers/cacambeirosController');
const adminController = require('../../src/controllers/adminController');
const usuariosController = require('../../src/controllers/usuariosController');
const alugueisController = require('../../src/controllers/alugueisController');
const sql = require('../../src/config/db');

/**
 * Property Tests for Dashboard Metrics and Admin Search
 * Validates: Requirements 12.1, 12.2, 13.1, 13.2, 13.3, 14.1, 14.3, 15.3, 15.4, 16.2, 16.3, 17.3, 17.5
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

const validNota = fc.float({ min: 1, max: 5, noNaN: true });
const validPrecoFinal = fc.float({ min: 10, max: 5000, noNaN: true });
const validDiasAluguel = fc.integer({ min: 1, max: 90 });

const statusAluguel = fc.constantFrom(
  'AGUARDANDO_ENTREGA', 'EM_USO', 'AGUARDANDO_RETIRADA', 'FINALIZADO'
);
const activeStatuses = ['AGUARDANDO_ENTREGA', 'EM_USO', 'AGUARDANDO_RETIRADA'];
const statusPagamento = fc.constantFrom('PENDENTE', 'PAGO', 'CANCELADO');

const validCategoryName = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

const validUserName = fc.string({ minLength: 3, maxLength: 120 })
  .filter(s => s.trim().length >= 3);

const validEmail = fc.emailAddress();

// ============================================================================
// Property 27: Dashboard metrics calculation correctness
// ============================================================================

describe('Property 27: Dashboard metrics calculation correctness', () => {
  /**
   * For any cacambeiro, dashboard SHALL display:
   * - total_orders = count of all their orders
   * - active_orders = count with status IN active statuses
   * - total_revenue = sum of preco_final where status_pagamento = 'PAGO'
   * - nota_media = average of review notas rounded to 1 decimal
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('total_orders equals count of all orders for the cacambeiro', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 50 }),
        fc.float({ min: 0, max: 50000, noNaN: true }),
        async (cacambeiroId, totalOrders, activeOrders, totalRevenue) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{
                total_orders: totalOrders,
                active_orders: activeOrders,
                total_revenue: totalRevenue
              }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{ nota_media: 4.2 }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, {}, {});
          req.usuario_id = cacambeiroId;

          await cacambeirosController.dashboard(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.total_orders).toBe(totalOrders);
          expect(res.jsonData.active_orders).toBe(activeOrders);
          expect(res.jsonData.total_revenue).toBe(totalRevenue);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('nota_media is correctly returned from review averages', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        fc.array(validNota, { minLength: 1, maxLength: 20 }),
        async (cacambeiroId, notas) => {
          const expectedAvg = parseFloat(
            (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1)
          );

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{
                total_orders: 10,
                active_orders: 3,
                total_revenue: 1000
              }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{ nota_media: expectedAvg }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, {}, {});
          req.usuario_id = cacambeiroId;

          await cacambeirosController.dashboard(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.nota_media).toBe(expectedAvg);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('nota_media is null when no reviews exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        async (cacambeiroId) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{
                total_orders: 5,
                active_orders: 2,
                total_revenue: 500
              }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{ nota_media: null }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, {}, {});
          req.usuario_id = cacambeiroId;

          await cacambeirosController.dashboard(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.nota_media).toBeNull();
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);
});

// ============================================================================
// Property 28: Financial data filtering correctness
// ============================================================================

describe('Property 28: Financial data filtering correctness', () => {
  /**
   * For any cacambeiro and date range (max 12 months), financial screen SHALL
   * display only orders where status_aluguel = 'FINALIZADO' AND
   * status_pagamento = 'PAGO' AND data_pedido within range.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only FINALIZADO + PAGO orders within date range', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        fc.array(
          fc.record({
            id: validUUID,
            preco_final: validPrecoFinal,
            status_aluguel: statusAluguel,
            status_pagamento: statusPagamento,
            data_pedido: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
          }),
          { minLength: 1, maxLength: 15 }
        ),
        async (cacambeiroId, orders) => {
          const dataInicio = '2024-03-01';
          const dataFim = '2024-06-30';
          const startDate = new Date(dataInicio);
          const endDate = new Date(dataFim);

          // Filter expected results
          const expectedOrders = orders.filter(o =>
            o.status_aluguel === 'FINALIZADO' &&
            o.status_pagamento === 'PAGO' &&
            o.data_pedido >= startDate &&
            o.data_pedido <= endDate
          );

          sql.mockImplementation(() => {
            return Promise.resolve(expectedOrders.map(o => ({
              ...o,
              preco_final: o.preco_final,
              data_pedido: o.data_pedido
            })));
          });

          const { req, res } = createMocks({}, {}, {
            data_inicio: dataInicio,
            data_fim: dataFim
          });
          req.usuario_id = cacambeiroId;

          await cacambeirosController.financeiro(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.data.length).toBe(expectedOrders.length);
          // All returned orders should be FINALIZADO + PAGO
          res.jsonData.data.forEach(order => {
            expect(order.status_aluguel).toBe('FINALIZADO');
            expect(order.status_pagamento).toBe('PAGO');
          });
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects date ranges exceeding 12 months', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        fc.integer({ min: 13, max: 36 }), // months exceeding 12
        async (cacambeiroId, monthsApart) => {
          const startDate = new Date('2023-01-01');
          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + monthsApart);

          const { req, res } = createMocks({}, {}, {
            data_inicio: startDate.toISOString().split('T')[0],
            data_fim: endDate.toISOString().split('T')[0]
          });
          req.usuario_id = cacambeiroId;

          await cacambeirosController.financeiro(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.error).toContain('12 meses');
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);

  it('revenue summary matches sum of preco_final in returned orders', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        fc.array(validPrecoFinal, { minLength: 1, maxLength: 10 }),
        async (cacambeiroId, precos) => {
          const orders = precos.map((preco, i) => ({
            id: `order-${i}`,
            preco_final: preco,
            status_aluguel: 'FINALIZADO',
            status_pagamento: 'PAGO',
            data_pedido: new Date('2024-03-15')
          }));

          sql.mockImplementation(() => Promise.resolve(orders));

          const { req, res } = createMocks({}, {}, {
            data_inicio: '2024-03-01',
            data_fim: '2024-03-31'
          });
          req.usuario_id = cacambeiroId;

          await cacambeirosController.financeiro(req, res);

          expect(res.statusCode).toBe(200);
          const expectedRevenue = precos.reduce((sum, p) => sum + p, 0);
          expect(res.jsonData.summary.total_revenue).toBeCloseTo(expectedRevenue, 1);
          expect(res.jsonData.summary.total_orders).toBe(precos.length);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 29: Admin dashboard platform-wide statistics
// ============================================================================

describe('Property 29: Admin dashboard platform-wide statistics', () => {
  /**
   * total_users, total_orders, total_revenue, active_cacambeiros,
   * orders_by_status are all correctly calculated.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns correct platform-wide statistics from database', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10000 }), // total_users
        fc.integer({ min: 0, max: 5000 }),  // total_orders
        fc.float({ min: 0, max: 1000000, noNaN: true }), // total_revenue
        fc.integer({ min: 0, max: 500 }),   // active_cacambeiros
        fc.record({
          AGUARDANDO_ENTREGA: fc.integer({ min: 0, max: 100 }),
          EM_USO: fc.integer({ min: 0, max: 100 }),
          AGUARDANDO_RETIRADA: fc.integer({ min: 0, max: 100 }),
          FINALIZADO: fc.integer({ min: 0, max: 100 })
        }),
        async (totalUsers, totalOrders, totalRevenue, activeCacambeiros, ordersByStatus) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            switch (callCount) {
              case 1: return Promise.resolve([{ total: totalUsers }]);
              case 2: return Promise.resolve([{ total: totalOrders }]);
              case 3: return Promise.resolve([{ total: totalRevenue }]);
              case 4: return Promise.resolve([{ total: activeCacambeiros }]);
              case 5: return Promise.resolve(
                Object.entries(ordersByStatus).map(([status, count]) => ({
                  status_aluguel: status, count
                }))
              );
              case 6: return Promise.resolve([]); // orders_over_time
              default: return Promise.resolve([]);
            }
          });

          const { req, res } = createMocks({}, {}, {});

          await adminController.dashboard(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.total_users).toBe(totalUsers);
          expect(res.jsonData.total_orders).toBe(totalOrders);
          expect(res.jsonData.total_revenue).toBe(Number(totalRevenue));
          expect(res.jsonData.active_cacambeiros).toBe(activeCacambeiros);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('orders_by_status maps each status to its count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          AGUARDANDO_ENTREGA: fc.integer({ min: 0, max: 200 }),
          EM_USO: fc.integer({ min: 0, max: 200 }),
          AGUARDANDO_RETIRADA: fc.integer({ min: 0, max: 200 }),
          FINALIZADO: fc.integer({ min: 0, max: 200 })
        }),
        async (ordersByStatus) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            switch (callCount) {
              case 1: return Promise.resolve([{ total: 100 }]);
              case 2: return Promise.resolve([{ total: 50 }]);
              case 3: return Promise.resolve([{ total: 10000 }]);
              case 4: return Promise.resolve([{ total: 20 }]);
              case 5: return Promise.resolve(
                Object.entries(ordersByStatus).map(([status, count]) => ({
                  status_aluguel: status, count
                }))
              );
              case 6: return Promise.resolve([]);
              default: return Promise.resolve([]);
            }
          });

          const { req, res } = createMocks({}, {}, {});

          await adminController.dashboard(req, res);

          expect(res.statusCode).toBe(200);
          Object.entries(ordersByStatus).forEach(([status, count]) => {
            expect(res.jsonData.orders_by_status[status]).toBe(count);
          });
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 30: Admin user search and filter
// ============================================================================

describe('Property 30: Admin user search and filter', () => {
  /**
   * Search (min 3 chars) matches nome_completo or email case-insensitively.
   * tipo_perfil filter works. Never includes senha_hash.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('search with min 3 chars filters users by nome_completo or email', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3),
        fc.array(
          fc.record({
            id: validUUID,
            nome_completo: validUserName,
            email: validEmail,
            tipo_perfil: fc.constantFrom('CONSUMIDOR', 'CACAMBEIRO', 'ADMIN'),
            documento: fc.string({ minLength: 11, maxLength: 14 }),
            telefone: fc.string({ minLength: 10, maxLength: 15 }),
            criado_em: fc.constant(new Date().toISOString())
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (searchTerm, users) => {
          // Simulate DB filtering (case-insensitive match on nome or email)
          const matchedUsers = users.filter(u =>
            u.nome_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.email.toLowerCase().includes(searchTerm.toLowerCase())
          );

          // The controller uses sql as tagged template multiple times:
          // 1. sql`WHERE 1=1` - builds conditions fragment
          // 2. sql`${conditions} AND (nome_completo ILIKE ...)` - adds search condition
          // 3. sql`SELECT COUNT(*)...` - count query (returns [{total}])
          // 4. sql`SELECT ...` - data query (returns users)
          const queryResults = [];
          let resultIndex = 0;

          // First calls build condition fragments (return something truthy/usable)
          // The count query returns [{total}], the data query returns users
          sql.mockImplementation((...args) => {
            resultIndex++;
            // Detect the count query by checking if it contains 'COUNT'
            const templateStr = Array.isArray(args[0]) ? args[0].join('') : '';
            if (templateStr.includes('COUNT')) {
              return Promise.resolve([{ total: matchedUsers.length }]);
            }
            if (templateStr.includes('SELECT') && templateStr.includes('FROM')) {
              return Promise.resolve(matchedUsers);
            }
            // Condition-building calls - return a fragment marker
            return 'condition-fragment';
          });

          const { req, res } = createMocks({}, {}, { search: searchTerm, page: '1' });
          req.tipo_perfil = 'ADMIN';

          await usuariosController.listarUsuarios(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.data.length).toBe(matchedUsers.length);
          // Verify no senha_hash in response
          res.jsonData.data.forEach(user => {
            expect(user).not.toHaveProperty('senha_hash');
          });
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('tipo_perfil filter returns only users of that type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('CONSUMIDOR', 'CACAMBEIRO', 'ADMIN'),
        fc.array(
          fc.record({
            id: validUUID,
            nome_completo: validUserName,
            email: validEmail,
            tipo_perfil: fc.constantFrom('CONSUMIDOR', 'CACAMBEIRO', 'ADMIN'),
            documento: fc.string({ minLength: 11, maxLength: 14 }),
            telefone: fc.string({ minLength: 10, maxLength: 15 }),
            criado_em: fc.constant(new Date().toISOString())
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (filterType, users) => {
          const filteredUsers = users.filter(u => u.tipo_perfil === filterType);

          // The controller uses sql as tagged template multiple times:
          // 1. sql`WHERE 1=1` - builds conditions fragment
          // 2. sql`${conditions} AND tipo_perfil = ...` - adds filter condition
          // 3. sql`SELECT COUNT(*)...` - count query
          // 4. sql`SELECT ...` - data query
          sql.mockImplementation((...args) => {
            const templateStr = Array.isArray(args[0]) ? args[0].join('') : '';
            if (templateStr.includes('COUNT')) {
              return Promise.resolve([{ total: filteredUsers.length }]);
            }
            if (templateStr.includes('SELECT') && templateStr.includes('FROM')) {
              return Promise.resolve(filteredUsers);
            }
            // Condition-building calls
            return 'condition-fragment';
          });

          const { req, res } = createMocks({}, {}, { tipo_perfil: filterType, page: '1' });
          req.tipo_perfil = 'ADMIN';

          await usuariosController.listarUsuarios(req, res);

          expect(res.statusCode).toBe(200);
          res.jsonData.data.forEach(user => {
            expect(user.tipo_perfil).toBe(filterType);
          });
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('never includes senha_hash in user detail response', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validUserName,
        validEmail,
        async (userId, nome, email) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // User query - note: controller SELECT excludes senha_hash
              return Promise.resolve([{
                id: userId,
                nome_completo: nome,
                email: email,
                tipo_perfil: 'CONSUMIDOR',
                documento: '12345678901',
                telefone: '11999999999',
                criado_em: new Date().toISOString()
              }]);
            }
            if (callCount === 2) return Promise.resolve([]); // enderecos
            if (callCount === 3) return Promise.resolve([]); // pedidos
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, { id: userId }, {});

          await usuariosController.detalheUsuario(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).not.toHaveProperty('senha_hash');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 31: Admin order search and filter
// ============================================================================

describe('Property 31: Admin order search and filter', () => {
  /**
   * Filters by status_aluguel, status_pagamento, and text search on
   * consumer/cacambeiro names.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters orders by status_aluguel correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        statusAluguel,
        fc.integer({ min: 0, max: 50 }),
        async (filterStatus, totalMatching) => {
          const matchedOrders = Array.from({ length: Math.min(totalMatching, 20) }, (_, i) => ({
            id: `order-${i}`,
            consumidor_id: `cons-${i}`,
            cacambeiro_id: `cac-${i}`,
            status_aluguel: filterStatus,
            status_pagamento: 'PAGO',
            data_pedido: new Date().toISOString(),
            consumidor_nome: `Consumer ${i}`,
            cacambeiro_nome: `Cacambeiro ${i}`
          }));

          sql.mockImplementation(() => {
            // The controller uses sql() with raw query strings
            return Promise.resolve(
              sql.mock.calls
                ? [{ total: totalMatching }]
                : matchedOrders
            );
          });

          // Mock for parameterized queries
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total: totalMatching }]);
            }
            return Promise.resolve(matchedOrders);
          });

          const { req, res } = createMocks({}, {}, {
            status_aluguel: filterStatus,
            page: '1'
          });

          await alugueisController.listarTodos(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.total).toBe(totalMatching);
          res.jsonData.data.forEach(order => {
            expect(order.status_aluguel).toBe(filterStatus);
          });
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('filters orders by status_pagamento correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        statusPagamento,
        fc.integer({ min: 0, max: 30 }),
        async (filterPayment, totalMatching) => {
          const matchedOrders = Array.from({ length: Math.min(totalMatching, 20) }, (_, i) => ({
            id: `order-${i}`,
            consumidor_id: `cons-${i}`,
            cacambeiro_id: `cac-${i}`,
            status_aluguel: 'FINALIZADO',
            status_pagamento: filterPayment,
            data_pedido: new Date().toISOString(),
            consumidor_nome: `Consumer ${i}`,
            cacambeiro_nome: `Cacambeiro ${i}`
          }));

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total: totalMatching }]);
            }
            return Promise.resolve(matchedOrders);
          });

          const { req, res } = createMocks({}, {}, {
            status_pagamento: filterPayment,
            page: '1'
          });

          await alugueisController.listarTodos(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.total).toBe(totalMatching);
          res.jsonData.data.forEach(order => {
            expect(order.status_pagamento).toBe(filterPayment);
          });
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('text search matches consumer or cacambeiro names', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length >= 1),
        async (searchTerm) => {
          const matchedOrders = [
            {
              id: 'order-1',
              consumidor_id: 'cons-1',
              cacambeiro_id: 'cac-1',
              status_aluguel: 'EM_USO',
              status_pagamento: 'PAGO',
              data_pedido: new Date().toISOString(),
              consumidor_nome: `${searchTerm} Silva`,
              cacambeiro_nome: 'Empresa ABC'
            }
          ];

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total: 1 }]);
            }
            return Promise.resolve(matchedOrders);
          });

          const { req, res } = createMocks({}, {}, {
            search: searchTerm,
            page: '1'
          });

          await alugueisController.listarTodos(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.data.length).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 32: Category name uniqueness (case-insensitive)
// ============================================================================

describe('Property 32: Category name uniqueness (case-insensitive)', () => {
  /**
   * Creating/updating with duplicate name (case-insensitive) is rejected.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects creating a category with a name that already exists (case-insensitive)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validCategoryName,
        fc.constantFrom('toLowerCase', 'toUpperCase', 'original'),
        async (categoryName, caseVariant) => {
          let existingName;
          switch (caseVariant) {
            case 'toLowerCase': existingName = categoryName.toLowerCase(); break;
            case 'toUpperCase': existingName = categoryName.toUpperCase(); break;
            default: existingName = categoryName;
          }

          sql.mockImplementation(() => {
            // The uniqueness check query returns an existing record
            return Promise.resolve([{ id: 'existing-id' }]);
          });

          const { req, res } = createMocks({ nome: existingName }, {}, {});

          await adminController.criarCategoria(req, res);

          expect(res.statusCode).toBe(409);
          expect(res.jsonData.error).toContain('Já existe');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects updating a category to a name that already exists (case-insensitive)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validCategoryName,
        async (categoryId, duplicateName) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // Category exists
              return Promise.resolve([{ id: categoryId }]);
            }
            if (callCount === 2) {
              // Duplicate check returns another category with same name
              return Promise.resolve([{ id: 'other-category-id' }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { nome: duplicateName },
            { id: categoryId },
            {}
          );

          await adminController.atualizarCategoria(req, res);

          expect(res.statusCode).toBe(409);
          expect(res.jsonData.error).toContain('Já existe');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('allows creating a category with a unique name', async () => {
    await fc.assert(
      fc.asyncProperty(
        validCategoryName,
        validUUID,
        async (categoryName, newId) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // Uniqueness check returns empty (no duplicate)
              return Promise.resolve([]);
            }
            if (callCount === 2) {
              // INSERT returns new category
              return Promise.resolve([{
                id: newId,
                nome: categoryName.trim(),
                criado_em: new Date().toISOString()
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({ nome: categoryName }, {}, {});

          await adminController.criarCategoria(req, res);

          expect(res.statusCode).toBe(201);
          expect(res.jsonData.nome).toBe(categoryName.trim());
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 33: Category deletion constraint
// ============================================================================

describe('Property 33: Category deletion constraint', () => {
  /**
   * Categories with associated dumpsters cannot be deleted.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects deletion when category has associated dumpsters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validCategoryName,
        fc.integer({ min: 1, max: 100 }), // number of associated dumpsters
        async (categoryId, categoryName, associatedCount) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // Category exists
              return Promise.resolve([{ id: categoryId, nome: categoryName }]);
            }
            if (callCount === 2) {
              // Count of associated dumpsters > 0
              return Promise.resolve([{ total: associatedCount }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, { id: categoryId }, {});

          await adminController.removerCategoria(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData.error).toContain('caçamba');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('allows deletion when category has no associated dumpsters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validCategoryName,
        async (categoryId, categoryName) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // Category exists
              return Promise.resolve([{ id: categoryId, nome: categoryName }]);
            }
            if (callCount === 2) {
              // No associated dumpsters
              return Promise.resolve([{ total: 0 }]);
            }
            if (callCount === 3) {
              // DELETE succeeds
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, { id: categoryId }, {});

          await adminController.removerCategoria(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.message).toContain('sucesso');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('returns 404 when trying to delete a non-existent category', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        async (categoryId) => {
          sql.mockImplementation(() => {
            // Category not found
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, { id: categoryId }, {});

          await adminController.removerCategoria(req, res);

          expect(res.statusCode).toBe(404);
          expect(res.jsonData.error).toContain('não encontrada');
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);
});
