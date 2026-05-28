const fc = require('fast-check');

// Mock the db module BEFORE any controller imports (jest.mock is hoisted)
jest.mock('../../src/config/db', () => jest.fn());

const avaliacoesController = require('../../src/controllers/avaliacoesController');
const sql = require('../../src/config/db');

/**
 * Property Tests for Review Submission
 * Property 22: Review submission constraints
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 *
 * Review submission SHALL only succeed when:
 * - Order has status_aluguel="FINALIZADO"
 * - Order belongs to the submitting consumer
 * - No previous review exists for that order
 * - nota is integer 1-5
 * - comentario (if provided) ≤ 500 chars
 * Violation of any condition SHALL result in rejection.
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

// Valid nota: integer between 1 and 5
const validNota = fc.integer({ min: 1, max: 5 });

// Invalid nota: values outside 1-5
const invalidNotaTooLow = fc.integer({ min: -100, max: 0 });
const invalidNotaTooHigh = fc.integer({ min: 6, max: 1000 });
const invalidNotaFloat = fc.double({ min: 1.1, max: 4.9, noNaN: true }).filter(n => !Number.isInteger(n));

// Valid comentario: string up to 500 chars
const validComentario = fc.string({ minLength: 0, maxLength: 500 });

// Invalid comentario: string exceeding 500 chars
const invalidComentario = fc.string({ minLength: 501, maxLength: 1000 });

// Order statuses that are NOT FINALIZADO
const nonFinalizadoStatuses = fc.constantFrom(
  'AGUARDANDO_ENTREGA',
  'EM_USO',
  'AGUARDANDO_RETIRADA'
);

// ============================================================================
// Property 22: Review submission constraints
// ============================================================================

describe('Property 22: Review submission constraints', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Requirement 9.1: Valid review submission succeeds
  // -------------------------------------------------------------------------

  describe('Requirement 9.1: Valid review submission succeeds when all conditions are met', () => {

    it('accepts review when order is FINALIZADO, belongs to consumer, no existing review, nota 1-5, comentario ≤ 500', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID, // consumidor_id
          validUUID, // aluguel_id
          validUUID, // cacambeiro_id
          validNota,
          validComentario,
          async (consumidorId, aluguelId, cacambeiroId, nota, comentario) => {
            let callCount = 0;
            sql.mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                // SELECT pedido: exists, belongs to consumer, FINALIZADO
                return Promise.resolve([{
                  id: aluguelId,
                  consumidor_id: consumidorId,
                  cacambeiro_id: cacambeiroId,
                  status_aluguel: 'FINALIZADO'
                }]);
              }
              if (callCount === 2) {
                // SELECT existing review: none
                return Promise.resolve([]);
              }
              if (callCount === 3) {
                // INSERT new review
                return Promise.resolve([{
                  id: 'new-review-uuid',
                  aluguel_id: aluguelId,
                  consumidor_id: consumidorId,
                  cacambeiro_id: cacambeiroId,
                  nota,
                  comentario: comentario || null,
                  data_avaliacao: new Date().toISOString()
                }]);
              }
              return Promise.resolve([]);
            });

            const { req, res } = createMocks(
              { aluguel_id: aluguelId, nota, comentario: comentario || undefined },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(201);
            expect(res.jsonData).toHaveProperty('nota', nota);
            expect(res.jsonData).toHaveProperty('aluguel_id', aluguelId);
            expect(res.jsonData).toHaveProperty('consumidor_id', consumidorId);
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);

    it('accepts review without comentario (optional field)', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID, // consumidor_id
          validUUID, // aluguel_id
          validUUID, // cacambeiro_id
          validNota,
          async (consumidorId, aluguelId, cacambeiroId, nota) => {
            let callCount = 0;
            sql.mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve([{
                  id: aluguelId,
                  consumidor_id: consumidorId,
                  cacambeiro_id: cacambeiroId,
                  status_aluguel: 'FINALIZADO'
                }]);
              }
              if (callCount === 2) {
                return Promise.resolve([]);
              }
              if (callCount === 3) {
                return Promise.resolve([{
                  id: 'new-review-uuid',
                  aluguel_id: aluguelId,
                  consumidor_id: consumidorId,
                  cacambeiro_id: cacambeiroId,
                  nota,
                  comentario: null,
                  data_avaliacao: new Date().toISOString()
                }]);
              }
              return Promise.resolve([]);
            });

            const { req, res } = createMocks(
              { aluguel_id: aluguelId, nota },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(201);
            expect(res.jsonData).toHaveProperty('nota', nota);
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // Requirement 9.2: Invalid nota or comentario rejects submission
  // -------------------------------------------------------------------------

  describe('Requirement 9.2: Rejects review with invalid nota or comentario', () => {

    it('rejects review when nota is below 1', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID,
          validUUID,
          invalidNotaTooLow,
          async (consumidorId, aluguelId, nota) => {
            const { req, res } = createMocks(
              { aluguel_id: aluguelId, nota },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.jsonData).toHaveProperty('error');
            expect(res.jsonData.error).toContain('nota');
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);

    it('rejects review when nota is above 5', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID,
          validUUID,
          invalidNotaTooHigh,
          async (consumidorId, aluguelId, nota) => {
            const { req, res } = createMocks(
              { aluguel_id: aluguelId, nota },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.jsonData).toHaveProperty('error');
            expect(res.jsonData.error).toContain('nota');
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);

    it('rejects review when nota is a non-integer float', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID,
          validUUID,
          invalidNotaFloat,
          async (consumidorId, aluguelId, nota) => {
            const { req, res } = createMocks(
              { aluguel_id: aluguelId, nota },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.jsonData).toHaveProperty('error');
            expect(res.jsonData.error).toContain('nota');
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);

    it('rejects review when comentario exceeds 500 characters', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID,
          validUUID,
          validNota,
          invalidComentario,
          async (consumidorId, aluguelId, nota, comentario) => {
            const { req, res } = createMocks(
              { aluguel_id: aluguelId, nota, comentario },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.jsonData).toHaveProperty('error');
            expect(res.jsonData.error).toContain('comentario');
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // Requirement 9.3: Rejects review for non-FINALIZADO orders
  // -------------------------------------------------------------------------

  describe('Requirement 9.3: Rejects review for non-FINALIZADO orders', () => {

    it('rejects review when order status is not FINALIZADO', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID, // consumidor_id
          validUUID, // aluguel_id
          validUUID, // cacambeiro_id
          validNota,
          nonFinalizadoStatuses,
          async (consumidorId, aluguelId, cacambeiroId, nota, status) => {
            let callCount = 0;
            sql.mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                // SELECT pedido: exists, belongs to consumer, but NOT FINALIZADO
                return Promise.resolve([{
                  id: aluguelId,
                  consumidor_id: consumidorId,
                  cacambeiro_id: cacambeiroId,
                  status_aluguel: status
                }]);
              }
              return Promise.resolve([]);
            });

            const { req, res } = createMocks(
              { aluguel_id: aluguelId, nota },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.jsonData).toHaveProperty('error');
            expect(res.jsonData.error).toContain('finalizados');
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // Requirement 9.4: Rejects duplicate review for same order
  // -------------------------------------------------------------------------

  describe('Requirement 9.4: Rejects duplicate review for same order', () => {

    it('rejects review when a review already exists for the order', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID, // consumidor_id
          validUUID, // aluguel_id
          validUUID, // cacambeiro_id
          validUUID, // existing review id
          validNota,
          async (consumidorId, aluguelId, cacambeiroId, existingReviewId, nota) => {
            let callCount = 0;
            sql.mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                // SELECT pedido: exists, belongs to consumer, FINALIZADO
                return Promise.resolve([{
                  id: aluguelId,
                  consumidor_id: consumidorId,
                  cacambeiro_id: cacambeiroId,
                  status_aluguel: 'FINALIZADO'
                }]);
              }
              if (callCount === 2) {
                // SELECT existing review: found (already reviewed)
                return Promise.resolve([{ id: existingReviewId }]);
              }
              return Promise.resolve([]);
            });

            const { req, res } = createMocks(
              { aluguel_id: aluguelId, nota },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.jsonData).toHaveProperty('error');
            expect(res.jsonData.error).toContain('já foi avaliado');
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // Requirement 9.5: Rejects review for order not belonging to consumer
  // -------------------------------------------------------------------------

  describe('Requirement 9.5: Rejects review for order not belonging to consumer', () => {

    it('rejects review when order does not belong to the submitting consumer', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID, // consumidor_id (submitting)
          validUUID, // aluguel_id
          validNota,
          async (consumidorId, aluguelId, nota) => {
            sql.mockImplementation(() => {
              // SELECT pedido with consumidor_id filter: returns empty (order not found for this consumer)
              return Promise.resolve([]);
            });

            const { req, res } = createMocks(
              { aluguel_id: aluguelId, nota },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.jsonData).toHaveProperty('error');
            expect(res.jsonData.error).toContain('não encontrado');
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // Combined: Missing required fields
  // -------------------------------------------------------------------------

  describe('Rejects review when required fields are missing', () => {

    it('rejects review when aluguel_id is missing', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID,
          validNota,
          async (consumidorId, nota) => {
            const { req, res } = createMocks(
              { nota },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.jsonData).toHaveProperty('error');
            expect(res.jsonData.error).toContain('aluguel_id');
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);

    it('rejects review when nota is missing', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUUID,
          validUUID,
          async (consumidorId, aluguelId) => {
            const { req, res } = createMocks(
              { aluguel_id: aluguelId },
              {},
              {}
            );
            req.usuario_id = consumidorId;

            await avaliacoesController.criar(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.jsonData).toHaveProperty('error');
            expect(res.jsonData.error).toContain('nota');
          }
        ),
        { numRuns: 50 }
      );
    }, 30000);
  });
});
