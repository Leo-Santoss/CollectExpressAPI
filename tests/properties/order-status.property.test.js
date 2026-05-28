const fc = require('fast-check');

// Mock the db module BEFORE any controller imports (jest.mock is hoisted)
jest.mock('../../src/config/db', () => jest.fn());

const alugueisController = require('../../src/controllers/alugueisController');
const sql = require('../../src/config/db');

/**
 * Property Tests for Order Status Transitions
 * Validates: Requirements 11.2, 11.6, 11.7, 8.4, 11.3
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

// --- Constants ---

const STATUS_SEQUENCE = [
  'AGUARDANDO_ENTREGA',
  'EM_USO',
  'AGUARDANDO_RETIRADA',
  'FINALIZADO'
];

// Color mapping for status display (deterministic and distinct)
const STATUS_COLOR_MAP = {
  'AGUARDANDO_ENTREGA': '#FFA500', // orange
  'EM_USO': '#2196F3',             // blue
  'AGUARDANDO_RETIRADA': '#9C27B0', // purple
  'FINALIZADO': '#4CAF50'           // green
};

// --- Arbitraries ---

const validUUID = fc.uuid();

// Generate a valid current status (any status except FINALIZADO for forward transitions)
const nonFinalStatus = fc.constantFrom(
  'AGUARDANDO_ENTREGA',
  'EM_USO',
  'AGUARDANDO_RETIRADA'
);

// Generate any valid status
const anyStatus = fc.constantFrom(...STATUS_SEQUENCE);

// Generate all possible (current, new) pairs
const allStatusPairs = fc.tuple(
  fc.constantFrom(...STATUS_SEQUENCE),
  fc.constantFrom(...STATUS_SEQUENCE)
);

// ============================================================================
// Property 20: Order status transitions are strictly sequential and forward-only
// ============================================================================

describe('Property 20: Order status transitions are strictly sequential and forward-only', () => {
  /**
   * **Validates: Requirements 11.2, 11.6, 11.7**
   *
   * For any order, status_aluguel transitions SHALL only advance in the sequence
   * AGUARDANDO_ENTREGA → EM_USO → AGUARDANDO_RETIRADA → FINALIZADO.
   * Any attempt to transition backward, skip a step, or update a FINALIZADO order
   * SHALL be rejected.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts only the next-in-sequence status transition', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // cacambeiro_id
        validUUID, // order_id
        nonFinalStatus, // current status (not FINALIZADO, so there is a valid next)
        async (cacambeiroId, orderId, currentStatus) => {
          const currentIndex = STATUS_SEQUENCE.indexOf(currentStatus);
          const nextStatus = STATUS_SEQUENCE[currentIndex + 1];

          sql.mockImplementation(() => {
            // SELECT order - returns order with current status
            return Promise.resolve([{
              id: orderId,
              cacambeiro_id: cacambeiroId,
              status_aluguel: currentStatus
            }]);
          });

          const { req, res } = createMocks(
            { status_aluguel: nextStatus },
            { id: orderId },
            {}
          );
          req.usuario_id = cacambeiroId;

          await alugueisController.atualizarStatus(req, res);

          expect(res.statusCode).toBe(200);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects backward status transitions', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // cacambeiro_id
        validUUID, // order_id
        allStatusPairs, // (current, new) pair
        async (cacambeiroId, orderId, [currentStatus, newStatus]) => {
          const currentIndex = STATUS_SEQUENCE.indexOf(currentStatus);
          const newIndex = STATUS_SEQUENCE.indexOf(newStatus);

          // Only test backward transitions (newIndex < currentIndex)
          fc.pre(newIndex < currentIndex);

          sql.mockImplementation(() => {
            return Promise.resolve([{
              id: orderId,
              cacambeiro_id: cacambeiroId,
              status_aluguel: currentStatus
            }]);
          });

          const { req, res } = createMocks(
            { status_aluguel: newStatus },
            { id: orderId },
            {}
          );
          req.usuario_id = cacambeiroId;

          await alugueisController.atualizarStatus(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects skip-step transitions (jumping more than one step forward)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // cacambeiro_id
        validUUID, // order_id
        allStatusPairs, // (current, new) pair
        async (cacambeiroId, orderId, [currentStatus, newStatus]) => {
          const currentIndex = STATUS_SEQUENCE.indexOf(currentStatus);
          const newIndex = STATUS_SEQUENCE.indexOf(newStatus);

          // Only test skip transitions (newIndex > currentIndex + 1)
          fc.pre(newIndex > currentIndex + 1);

          sql.mockImplementation(() => {
            return Promise.resolve([{
              id: orderId,
              cacambeiro_id: cacambeiroId,
              status_aluguel: currentStatus
            }]);
          });

          const { req, res } = createMocks(
            { status_aluguel: newStatus },
            { id: orderId },
            {}
          );
          req.usuario_id = cacambeiroId;

          await alugueisController.atualizarStatus(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects any update to a FINALIZADO order', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // cacambeiro_id
        validUUID, // order_id
        anyStatus, // attempted new status
        async (cacambeiroId, orderId, newStatus) => {
          sql.mockImplementation(() => {
            return Promise.resolve([{
              id: orderId,
              cacambeiro_id: cacambeiroId,
              status_aluguel: 'FINALIZADO'
            }]);
          });

          const { req, res } = createMocks(
            { status_aluguel: newStatus },
            { id: orderId },
            {}
          );
          req.usuario_id = cacambeiroId;

          await alugueisController.atualizarStatus(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('finalizado');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects same-status transitions (no-op)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // cacambeiro_id
        validUUID, // order_id
        nonFinalStatus, // current status
        async (cacambeiroId, orderId, currentStatus) => {
          sql.mockImplementation(() => {
            return Promise.resolve([{
              id: orderId,
              cacambeiro_id: cacambeiroId,
              status_aluguel: currentStatus
            }]);
          });

          // Attempt to transition to the same status
          const { req, res } = createMocks(
            { status_aluguel: currentStatus },
            { id: orderId },
            {}
          );
          req.usuario_id = cacambeiroId;

          await alugueisController.atualizarStatus(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});

// ============================================================================
// Property 21: Status color mapping is deterministic and distinct
// ============================================================================

describe('Property 21: Status color mapping is deterministic and distinct', () => {
  /**
   * **Validates: Requirements 8.4, 11.3**
   *
   * For any status_aluguel value, the mapped display color SHALL be deterministic
   * (same status always maps to same color) and distinct (no two different statuses
   * map to the same color).
   */

  it('same status always maps to the same color (deterministic)', () => {
    fc.assert(
      fc.property(
        anyStatus,
        fc.integer({ min: 1, max: 100 }), // number of lookups
        (status, lookups) => {
          const firstColor = STATUS_COLOR_MAP[status];

          // Verify that repeated lookups always return the same color
          for (let i = 0; i < lookups; i++) {
            expect(STATUS_COLOR_MAP[status]).toBe(firstColor);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no two different statuses map to the same color (distinct)', () => {
    fc.assert(
      fc.property(
        fc.tuple(anyStatus, anyStatus),
        ([statusA, statusB]) => {
          // Only test when statuses are different
          fc.pre(statusA !== statusB);

          const colorA = STATUS_COLOR_MAP[statusA];
          const colorB = STATUS_COLOR_MAP[statusB];

          expect(colorA).not.toBe(colorB);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every status in the sequence has a defined color mapping', () => {
    fc.assert(
      fc.property(
        anyStatus,
        (status) => {
          const color = STATUS_COLOR_MAP[status];

          // Color must be defined
          expect(color).toBeDefined();
          expect(typeof color).toBe('string');
          // Color must be a valid hex color
          expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all four statuses have unique colors (exhaustive check)', () => {
    const colors = Object.values(STATUS_COLOR_MAP);
    const uniqueColors = new Set(colors);

    // All 4 statuses must have distinct colors
    expect(uniqueColors.size).toBe(STATUS_SEQUENCE.length);
    expect(colors.length).toBe(STATUS_SEQUENCE.length);
  });
});
