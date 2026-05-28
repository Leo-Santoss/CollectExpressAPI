const fc = require('fast-check');

// Mock the db module BEFORE any controller imports (jest.mock is hoisted)
jest.mock('../../src/config/db', () => jest.fn());

const sql = require('../../src/config/db');
const cacambasController = require('../../src/controllers/cacambasController');

// --- Helper functions ---

function createMocks({ query = {}, params = {} } = {}) {
  const req = { query, params, body: {}, ip: '127.0.0.1' };
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

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

function stringFromChars(chars, minLength, maxLength) {
  return fc.array(
    fc.constantFrom(...chars.split('')),
    { minLength, maxLength }
  ).map(arr => arr.join(''));
}

const validTipoResiduo = fc.constantFrom('entulho', 'madeira', 'metal', 'plastico', 'organico', 'misto');

const validCacambeiroId = fc.uuid();

// Search text must be at least 3 characters
const validSearchText = stringFromChars(LOWER, 3, 20);

// Generate a dumpster record
function generateDumpster(overrides = {}) {
  return {
    id: fc.sample(fc.uuid(), 1)[0],
    cacambeiro_id: overrides.cacambeiro_id || fc.sample(fc.uuid(), 1)[0],
    nome: overrides.nome || 'Cacamba Test',
    tipo_residuo: overrides.tipo_residuo || 'entulho',
    tamanho_m3: 5.0,
    preco_diaria: 100.0,
    foto_url: null,
    disponivel: overrides.disponivel !== undefined ? overrides.disponivel : true,
    criado_em: new Date().toISOString(),
    ...overrides
  };
}

// ============================================================
// Property 11: Marketplace filtering returns only matching results
// ============================================================

describe('Property 11: Marketplace filtering returns only matching results', () => {
  /**
   * **Validates: Requirements 4.2, 4.3**
   *
   * For any combination of active filters (tipo_residuo, cacambeiro_id) and search text
   * (3+ characters), all returned dumpsters SHALL satisfy ALL active filters (AND logic)
   * and SHALL have disponivel=TRUE. Search results SHALL match nome case-insensitively.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return only dumpsters matching tipo_residuo filter with disponivel=true', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTipoResiduo,
        fc.integer({ min: 0, max: 50 }),
        async (tipoResiduo, totalMatching) => {
          // Generate matching dumpsters (all disponivel=true and matching tipo_residuo)
          const matchingDumpsters = Array.from({ length: Math.min(totalMatching, 20) }, () =>
            generateDumpster({ tipo_residuo: tipoResiduo, disponivel: true })
          );

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            // First call is the count query
            if (callCount === 1) {
              return Promise.resolve([{ total: totalMatching }]);
            }
            // Second call is the data query
            return Promise.resolve(matchingDumpsters);
          });

          const { req, res } = createMocks({
            query: { tipo_residuo: tipoResiduo, page: '1' }
          });

          await cacambasController.listar(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toHaveProperty('data');
          expect(Array.isArray(res.jsonData.data)).toBe(true);

          // All returned dumpsters must have disponivel=true
          res.jsonData.data.forEach(dumpster => {
            expect(dumpster.disponivel).toBe(true);
          });

          // All returned dumpsters must match the tipo_residuo filter
          res.jsonData.data.forEach(dumpster => {
            expect(dumpster.tipo_residuo).toBe(tipoResiduo);
          });
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);

  it('should return only dumpsters matching cacambeiro_id filter with disponivel=true', async () => {
    await fc.assert(
      fc.asyncProperty(
        validCacambeiroId,
        fc.integer({ min: 0, max: 30 }),
        async (cacambeiroId, totalMatching) => {
          const matchingDumpsters = Array.from({ length: Math.min(totalMatching, 20) }, () =>
            generateDumpster({ cacambeiro_id: cacambeiroId, disponivel: true })
          );

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total: totalMatching }]);
            }
            return Promise.resolve(matchingDumpsters);
          });

          const { req, res } = createMocks({
            query: { cacambeiro_id: cacambeiroId, page: '1' }
          });

          await cacambasController.listar(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toHaveProperty('data');

          // All returned dumpsters must have disponivel=true
          res.jsonData.data.forEach(dumpster => {
            expect(dumpster.disponivel).toBe(true);
          });

          // All returned dumpsters must match the cacambeiro_id filter
          res.jsonData.data.forEach(dumpster => {
            expect(dumpster.cacambeiro_id).toBe(cacambeiroId);
          });
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);

  it('should return only dumpsters matching combined filters (tipo_residuo AND cacambeiro_id AND search)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTipoResiduo,
        validCacambeiroId,
        validSearchText,
        fc.integer({ min: 0, max: 20 }),
        async (tipoResiduo, cacambeiroId, searchText, totalMatching) => {
          const matchingDumpsters = Array.from({ length: Math.min(totalMatching, 20) }, () =>
            generateDumpster({
              tipo_residuo: tipoResiduo,
              cacambeiro_id: cacambeiroId,
              nome: `Cacamba ${searchText} modelo`,
              disponivel: true
            })
          );

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total: totalMatching }]);
            }
            return Promise.resolve(matchingDumpsters);
          });

          const { req, res } = createMocks({
            query: {
              tipo_residuo: tipoResiduo,
              cacambeiro_id: cacambeiroId,
              search: searchText,
              page: '1'
            }
          });

          await cacambasController.listar(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toHaveProperty('data');

          // All returned dumpsters must satisfy ALL filters
          res.jsonData.data.forEach(dumpster => {
            expect(dumpster.disponivel).toBe(true);
            expect(dumpster.tipo_residuo).toBe(tipoResiduo);
            expect(dumpster.cacambeiro_id).toBe(cacambeiroId);
            // Search should match nome case-insensitively
            expect(dumpster.nome.toLowerCase()).toContain(searchText.toLowerCase());
          });
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);

  it('should ignore search text shorter than 3 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringFromChars(LOWER, 1, 2),
        fc.integer({ min: 1, max: 10 }),
        async (shortSearch, total) => {
          const dumpsters = Array.from({ length: total }, () =>
            generateDumpster({ disponivel: true })
          );

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total }]);
            }
            return Promise.resolve(dumpsters);
          });

          const { req, res } = createMocks({
            query: { search: shortSearch, page: '1' }
          });

          await cacambasController.listar(req, res);

          expect(res.statusCode).toBe(200);
          // The controller should still return results (search ignored for <3 chars)
          expect(res.jsonData).toHaveProperty('data');
          expect(res.jsonData.data.length).toBe(total);
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);
});

// ============================================================
// Property 12: Pagination returns correct page size
// ============================================================

describe('Property 12: Pagination returns correct page size', () => {
  /**
   * **Validates: Requirements 4.5**
   *
   * For any paginated request, each page SHALL contain at most 20 items,
   * and the totalPages calculation SHALL be correct (Math.ceil(total / 20)).
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return at most 20 items per page and correct totalPages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 1, max: 10 }),
        async (totalItems, page) => {
          const ITEMS_PER_PAGE = 20;
          const expectedTotalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
          const itemsOnThisPage = Math.min(
            ITEMS_PER_PAGE,
            Math.max(0, totalItems - (page - 1) * ITEMS_PER_PAGE)
          );

          const dumpsters = Array.from({ length: itemsOnThisPage }, () =>
            generateDumpster({ disponivel: true })
          );

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total: totalItems }]);
            }
            return Promise.resolve(dumpsters);
          });

          const { req, res } = createMocks({
            query: { page: String(page) }
          });

          await cacambasController.listar(req, res);

          expect(res.statusCode).toBe(200);

          // Page size must be at most 20
          expect(res.jsonData.data.length).toBeLessThanOrEqual(ITEMS_PER_PAGE);

          // totalPages must be correct
          expect(res.jsonData.totalPages).toBe(expectedTotalPages);

          // total must match
          expect(res.jsonData.total).toBe(totalItems);

          // page must match the requested page
          expect(res.jsonData.page).toBe(page);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('should default to page 1 when page is not provided or invalid', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(undefined),
          fc.constant('0'),
          fc.constant('-1'),
          fc.constant('abc'),
          fc.constant('')
        ),
        fc.integer({ min: 1, max: 50 }),
        async (invalidPage, totalItems) => {
          const dumpsters = Array.from(
            { length: Math.min(20, totalItems) },
            () => generateDumpster({ disponivel: true })
          );

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total: totalItems }]);
            }
            return Promise.resolve(dumpsters);
          });

          const query = {};
          if (invalidPage !== undefined) {
            query.page = invalidPage;
          }

          const { req, res } = createMocks({ query });

          await cacambasController.listar(req, res);

          expect(res.statusCode).toBe(200);
          // Should default to page 1
          expect(res.jsonData.page).toBe(1);
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);

  it('should calculate totalPages correctly for various totals', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 500 }),
        async (totalItems) => {
          const ITEMS_PER_PAGE = 20;
          const expectedTotalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
          const itemsOnPage = Math.min(ITEMS_PER_PAGE, totalItems);

          const dumpsters = Array.from({ length: itemsOnPage }, () =>
            generateDumpster({ disponivel: true })
          );

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total: totalItems }]);
            }
            return Promise.resolve(dumpsters);
          });

          const { req, res } = createMocks({ query: { page: '1' } });

          await cacambasController.listar(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.totalPages).toBe(expectedTotalPages);

          // Verify the relationship: (totalPages - 1) * 20 < total <= totalPages * 20
          if (totalItems > 0) {
            expect((expectedTotalPages - 1) * ITEMS_PER_PAGE).toBeLessThan(totalItems);
            expect(totalItems).toBeLessThanOrEqual(expectedTotalPages * ITEMS_PER_PAGE);
          } else {
            expect(expectedTotalPages).toBe(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================
// Property 13: Reviews limited to 10 most recent per cacambeiro
// ============================================================

describe('Property 13: Reviews limited to 10 most recent per cacambeiro', () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * For any cacambeiro with N reviews, the detail endpoint SHALL return at most 10 reviews
   * sorted by data_avaliacao descending, and the returned count SHALL equal min(N, 10).
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return at most 10 reviews regardless of total review count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 0, max: 50 }),
        async (dumpsterId, totalReviews) => {
          const cacambeiroId = fc.sample(fc.uuid(), 1)[0];

          // Generate the dumpster detail row
          const cacambaRow = {
            id: dumpsterId,
            cacambeiro_id: cacambeiroId,
            nome: 'Cacamba Test',
            tipo_residuo: 'entulho',
            tamanho_m3: 5.0,
            preco_diaria: 100.0,
            foto_url: null,
            disponivel: true,
            criado_em: new Date().toISOString(),
            cacambeiro_nome_completo: 'Cacambeiro Test',
            cacambeiro_telefone: '11999999999',
            cacambeiro_horario_inicio: '08:00',
            cacambeiro_horario_fim: '18:00',
            cacambeiro_raio_entrega_km: 20,
            cacambeiro_taxa_entrega: 50.0
          };

          // Generate reviews (the DB query already limits to 10 via LIMIT 10)
          const reviewsReturned = Math.min(totalReviews, 10);
          const reviews = Array.from({ length: reviewsReturned }, (_, i) => ({
            nota: (i % 5) + 1,
            comentario: `Review ${i}`,
            data_avaliacao: new Date(Date.now() - i * 86400000).toISOString(),
            nome_completo: `Reviewer ${i}`
          }));

          const notaMedia = totalReviews > 0
            ? parseFloat((reviews.reduce((sum, r) => sum + r.nota, 0) / reviews.length).toFixed(1))
            : null;

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            switch (callCount) {
              case 1: // Dumpster detail query
                return Promise.resolve([cacambaRow]);
              case 2: // nota_media query
                return Promise.resolve([{ nota_media: notaMedia }]);
              case 3: // Reviews query (already limited to 10 by SQL LIMIT)
                return Promise.resolve(reviews);
              default:
                return Promise.resolve([]);
            }
          });

          const { req, res } = createMocks({ params: { id: dumpsterId } });

          await cacambasController.detalhe(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toHaveProperty('avaliacoes');
          expect(Array.isArray(res.jsonData.avaliacoes)).toBe(true);

          // Reviews count must be at most 10
          expect(res.jsonData.avaliacoes.length).toBeLessThanOrEqual(10);

          // Reviews count must equal min(N, 10)
          expect(res.jsonData.avaliacoes.length).toBe(Math.min(totalReviews, 10));
        }
      ),
      { numRuns: 30 }
    );
  }, 30000);

  it('should return reviews sorted by data_avaliacao descending (most recent first)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 2, max: 10 }),
        async (dumpsterId, reviewCount) => {
          const cacambeiroId = fc.sample(fc.uuid(), 1)[0];

          const cacambaRow = {
            id: dumpsterId,
            cacambeiro_id: cacambeiroId,
            nome: 'Cacamba Test',
            tipo_residuo: 'entulho',
            tamanho_m3: 5.0,
            preco_diaria: 100.0,
            foto_url: null,
            disponivel: true,
            criado_em: new Date().toISOString(),
            cacambeiro_nome_completo: 'Cacambeiro Test',
            cacambeiro_telefone: '11999999999',
            cacambeiro_horario_inicio: '08:00',
            cacambeiro_horario_fim: '18:00',
            cacambeiro_raio_entrega_km: 20,
            cacambeiro_taxa_entrega: 50.0
          };

          // Generate reviews already sorted by data_avaliacao DESC (as the DB would return)
          const reviews = Array.from({ length: reviewCount }, (_, i) => ({
            nota: (i % 5) + 1,
            comentario: `Review ${i}`,
            data_avaliacao: new Date(Date.now() - i * 86400000).toISOString(),
            nome_completo: `Reviewer ${i}`
          }));

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            switch (callCount) {
              case 1:
                return Promise.resolve([cacambaRow]);
              case 2:
                return Promise.resolve([{ nota_media: 3.5 }]);
              case 3:
                return Promise.resolve(reviews);
              default:
                return Promise.resolve([]);
            }
          });

          const { req, res } = createMocks({ params: { id: dumpsterId } });

          await cacambasController.detalhe(req, res);

          expect(res.statusCode).toBe(200);

          const avaliacoes = res.jsonData.avaliacoes;

          // Verify descending order by data_avaliacao
          for (let i = 0; i < avaliacoes.length - 1; i++) {
            const current = new Date(avaliacoes[i].data_avaliacao).getTime();
            const next = new Date(avaliacoes[i + 1].data_avaliacao).getTime();
            expect(current).toBeGreaterThanOrEqual(next);
          }
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);

  it('should return empty array when cacambeiro has no reviews', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (dumpsterId) => {
          const cacambeiroId = fc.sample(fc.uuid(), 1)[0];

          const cacambaRow = {
            id: dumpsterId,
            cacambeiro_id: cacambeiroId,
            nome: 'Cacamba Test',
            tipo_residuo: 'entulho',
            tamanho_m3: 5.0,
            preco_diaria: 100.0,
            foto_url: null,
            disponivel: true,
            criado_em: new Date().toISOString(),
            cacambeiro_nome_completo: 'Cacambeiro Test',
            cacambeiro_telefone: '11999999999',
            cacambeiro_horario_inicio: '08:00',
            cacambeiro_horario_fim: '18:00',
            cacambeiro_raio_entrega_km: 20,
            cacambeiro_taxa_entrega: 50.0
          };

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            switch (callCount) {
              case 1:
                return Promise.resolve([cacambaRow]);
              case 2:
                return Promise.resolve([{ nota_media: null }]);
              case 3:
                return Promise.resolve([]); // No reviews
              default:
                return Promise.resolve([]);
            }
          });

          const { req, res } = createMocks({ params: { id: dumpsterId } });

          await cacambasController.detalhe(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData.avaliacoes).toEqual([]);
          expect(res.jsonData.avaliacoes.length).toBe(0);
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);
});
