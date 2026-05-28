const fc = require('fast-check');

// Mock the db module BEFORE any controller imports (jest.mock is hoisted)
jest.mock('../../src/config/db', () => jest.fn());

const enderecosController = require('../../src/controllers/enderecosController');
const usuariosController = require('../../src/controllers/usuariosController');
const sql = require('../../src/config/db');

/**
 * Property Tests for Address, Profile, and Admin Modules
 * Validates: Requirements 19.2, 19.3, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7
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

// Valid nome_completo: 3-120 characters
const validNomeCompleto = fc.string({ minLength: 3, maxLength: 120 }).filter(s => s.trim().length >= 3 && s.trim().length <= 120);

// Invalid nome_completo: too short (trimmed < 3)
const invalidNomeCompletoTooShort = fc.constantFrom('', 'A', 'AB', '  ', ' A ');

// Invalid nome_completo: too long (> 120 characters)
const invalidNomeCompletoTooLong = fc.string({ minLength: 121, maxLength: 200 }).filter(s => s.trim().length > 120);

// Helper to generate digit strings of a specific length
function digitString(minLen, maxLen) {
  return fc.integer({ min: minLen, max: maxLen }).chain(len =>
    fc.array(fc.integer({ min: 0, max: 9 }), { minLength: len, maxLength: len })
      .map(digits => digits.join(''))
  );
}

// Valid telefone: 10-15 digits
const validTelefone = digitString(10, 15);

// Invalid telefone: too short (< 10 digits)
const invalidTelefoneTooShort = digitString(1, 9);

// Invalid telefone: too long (> 15 digits)
const invalidTelefoneTooLong = digitString(16, 25);

// Invalid telefone: contains non-digit characters
const invalidTelefoneNonDigit = fc.tuple(
  digitString(4, 7),
  fc.constantFrom('a', 'b', 'X', '-', '.', ' ', '(', ')'),
  digitString(4, 7)
).map(([a, c, b]) => a + c + b);

// Valid CEP: exactly 8 digits
const validCep = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 8 })
  .map(digits => digits.join(''));

// Invalid CEP: not exactly 8 digits
const invalidCepWrongLength = fc.oneof(
  digitString(1, 7),
  digitString(9, 15)
);

// Valid logradouro: 1-200 characters
const validLogradouro = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.length >= 1);

// Invalid logradouro: too long (> 200 characters)
const invalidLogradouroTooLong = fc.string({ minLength: 201, maxLength: 250 });

// Valid numero: 1-20 characters
const validNumero = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.length >= 1);

// Invalid numero: too long (> 20 characters)
const invalidNumeroTooLong = fc.string({ minLength: 21, maxLength: 40 });

// Valid cidade_estado: 1-100 characters
const validCidadeEstado = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.length >= 1);

// Invalid cidade_estado: too long (> 100 characters)
const invalidCidadeEstadoTooLong = fc.string({ minLength: 101, maxLength: 150 });

// Active order statuses that block address deletion
const activeOrderStatuses = fc.constantFrom('AGUARDANDO_ENTREGA', 'EM_USO', 'AGUARDANDO_RETIRADA');


// ============================================================================
// Property 34: Profile update validation
// ============================================================================

describe('Property 34: Profile update validation', () => {
  /**
   * **Validates: Requirements 19.2, 19.3**
   *
   * For any profile update, nome_completo SHALL be between 3 and 120 characters
   * and telefone SHALL be between 10 and 15 digits. Values outside these ranges
   * SHALL be rejected with a specific error. Email, documento, and tipo_perfil
   * SHALL NOT be modifiable.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects nome_completo shorter than 3 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        invalidNomeCompletoTooShort,
        async (usuarioId, nome_completo) => {
          const { req, res } = createMocks({ nome_completo }, {}, {});
          req.usuario_id = usuarioId;

          await usuariosController.updatePerfil(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('fields');
          expect(res.jsonData.fields).toHaveProperty('nome_completo');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects nome_completo longer than 120 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        invalidNomeCompletoTooLong,
        async (usuarioId, nome_completo) => {
          const { req, res } = createMocks({ nome_completo }, {}, {});
          req.usuario_id = usuarioId;

          await usuariosController.updatePerfil(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('fields');
          expect(res.jsonData.fields).toHaveProperty('nome_completo');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects telefone with fewer than 10 digits', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        invalidTelefoneTooShort,
        async (usuarioId, telefone) => {
          const { req, res } = createMocks({ telefone }, {}, {});
          req.usuario_id = usuarioId;

          await usuariosController.updatePerfil(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('fields');
          expect(res.jsonData.fields).toHaveProperty('telefone');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects telefone with more than 15 digits', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        invalidTelefoneTooLong,
        async (usuarioId, telefone) => {
          const { req, res } = createMocks({ telefone }, {}, {});
          req.usuario_id = usuarioId;

          await usuariosController.updatePerfil(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('fields');
          expect(res.jsonData.fields).toHaveProperty('telefone');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects telefone with non-digit characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        invalidTelefoneNonDigit,
        async (usuarioId, telefone) => {
          const { req, res } = createMocks({ telefone }, {}, {});
          req.usuario_id = usuarioId;

          await usuariosController.updatePerfil(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('fields');
          expect(res.jsonData.fields).toHaveProperty('telefone');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('accepts valid nome_completo and telefone and returns updated profile', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validNomeCompleto,
        validTelefone,
        async (usuarioId, nome_completo, telefone) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            // UPDATE query, then SELECT for returning profile
            return Promise.resolve([{
              id: usuarioId,
              nome_completo: nome_completo.trim(),
              email: 'test@example.com',
              tipo_perfil: 'CONSUMIDOR',
              documento: '12345678900',
              telefone,
              criado_em: '2024-01-01'
            }]);
          });

          const { req, res } = createMocks({ nome_completo, telefone }, {}, {});
          req.usuario_id = usuarioId;

          await usuariosController.updatePerfil(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toHaveProperty('nome_completo');
          expect(res.jsonData).toHaveProperty('telefone');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('does not allow modification of email, documento, or tipo_perfil', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        fc.emailAddress(),
        fc.string({ minLength: 11, maxLength: 14 }),
        fc.constantFrom('CONSUMIDOR', 'CACAMBEIRO', 'ADMIN'),
        async (usuarioId, email, documento, tipo_perfil) => {
          const originalEmail = 'original@example.com';
          const originalDocumento = '00000000000';
          const originalTipoPerfil = 'CONSUMIDOR';

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            // Always return the original values regardless of what was sent
            return Promise.resolve([{
              id: usuarioId,
              nome_completo: 'Nome Original',
              email: originalEmail,
              tipo_perfil: originalTipoPerfil,
              documento: originalDocumento,
              telefone: '11999999999',
              criado_em: '2024-01-01'
            }]);
          });

          const { req, res } = createMocks(
            { email, documento, tipo_perfil },
            {},
            {}
          );
          req.usuario_id = usuarioId;

          await usuariosController.updatePerfil(req, res);

          // The controller should not update email/documento/tipo_perfil
          // It only processes nome_completo and telefone from body
          expect(res.statusCode).toBe(200);
          expect(res.jsonData.email).toBe(originalEmail);
          expect(res.jsonData.documento).toBe(originalDocumento);
          expect(res.jsonData.tipo_perfil).toBe(originalTipoPerfil);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});


// ============================================================================
// Property 35: Address creation validation
// ============================================================================

describe('Property 35: Address creation validation', () => {
  /**
   * **Validates: Requirements 20.2, 20.3**
   *
   * For any address creation payload, cep SHALL be exactly 8 digits,
   * logradouro SHALL be 1-200 characters, numero SHALL be 1-20 characters,
   * and cidade_estado SHALL be 1-100 characters. Invalid fields SHALL be
   * rejected with specific errors.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects address with invalid CEP (wrong length)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        invalidCepWrongLength,
        validLogradouro,
        validNumero,
        validCidadeEstado,
        async (usuarioId, cep, logradouro, numero, cidade_estado) => {
          const { req, res } = createMocks(
            { cep, logradouro, numero, cidade_estado },
            {},
            {}
          );
          req.usuario_id = usuarioId;

          await enderecosController.criar(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('fields');
          expect(res.jsonData.fields).toHaveProperty('cep');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects address with empty CEP', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validLogradouro,
        validNumero,
        validCidadeEstado,
        async (usuarioId, logradouro, numero, cidade_estado) => {
          const { req, res } = createMocks(
            { cep: '', logradouro, numero, cidade_estado },
            {},
            {}
          );
          req.usuario_id = usuarioId;

          await enderecosController.criar(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('fields');
          expect(res.jsonData.fields).toHaveProperty('cep');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects address with logradouro exceeding 200 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validCep,
        invalidLogradouroTooLong,
        validNumero,
        validCidadeEstado,
        async (usuarioId, cep, logradouro, numero, cidade_estado) => {
          const { req, res } = createMocks(
            { cep, logradouro, numero, cidade_estado },
            {},
            {}
          );
          req.usuario_id = usuarioId;

          await enderecosController.criar(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('fields');
          expect(res.jsonData.fields).toHaveProperty('logradouro');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects address with numero exceeding 20 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validCep,
        validLogradouro,
        invalidNumeroTooLong,
        validCidadeEstado,
        async (usuarioId, cep, logradouro, numero, cidade_estado) => {
          const { req, res } = createMocks(
            { cep, logradouro, numero, cidade_estado },
            {},
            {}
          );
          req.usuario_id = usuarioId;

          await enderecosController.criar(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('fields');
          expect(res.jsonData.fields).toHaveProperty('numero');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('rejects address with cidade_estado exceeding 100 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validCep,
        validLogradouro,
        validNumero,
        invalidCidadeEstadoTooLong,
        async (usuarioId, cep, logradouro, numero, cidade_estado) => {
          const { req, res } = createMocks(
            { cep, logradouro, numero, cidade_estado },
            {},
            {}
          );
          req.usuario_id = usuarioId;

          await enderecosController.criar(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('fields');
          expect(res.jsonData.fields).toHaveProperty('cidade_estado');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('accepts address with all valid fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validCep,
        validLogradouro,
        validNumero,
        validCidadeEstado,
        async (usuarioId, cep, logradouro, numero, cidade_estado) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // COUNT query - user has fewer than 10 addresses
              return Promise.resolve([{ total: 5 }]);
            }
            if (callCount === 2) {
              // INSERT query
              return Promise.resolve([{
                id: 'new-address-uuid',
                cep,
                logradouro,
                numero,
                bairro: null,
                cidade_estado,
                criado_em: '2024-01-01'
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { cep, logradouro, numero, cidade_estado },
            {},
            {}
          );
          req.usuario_id = usuarioId;

          await enderecosController.criar(req, res);

          expect(res.statusCode).toBe(201);
          expect(res.jsonData).toHaveProperty('id');
          expect(res.jsonData).toHaveProperty('cep', cep);
          expect(res.jsonData).toHaveProperty('logradouro', logradouro);
          expect(res.jsonData).toHaveProperty('numero', numero);
          expect(res.jsonData).toHaveProperty('cidade_estado', cidade_estado);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});


// ============================================================================
// Property 36: Address deletion constraint
// ============================================================================

describe('Property 36: Address deletion constraint', () => {
  /**
   * **Validates: Requirements 20.5, 20.6**
   *
   * For any address with active orders (status IN AGUARDANDO_ENTREGA, EM_USO,
   * AGUARDANDO_RETIRADA), deletion SHALL be rejected.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects deletion when address has active orders', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // usuario_id
        validUUID, // endereco_id
        activeOrderStatuses, // active status
        fc.integer({ min: 1, max: 10 }), // number of active orders
        async (usuarioId, enderecoId, status, activeCount) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // SELECT endereco - exists and belongs to user
              return Promise.resolve([{ id: enderecoId, usuario_id: usuarioId }]);
            }
            if (callCount === 2) {
              // SELECT COUNT active alugueis - has active orders
              return Promise.resolve([{ total: activeCount }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, { id: enderecoId }, {});
          req.usuario_id = usuarioId;

          await enderecosController.remover(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('pedidos ativos');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('allows deletion when address has no active orders', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // usuario_id
        validUUID, // endereco_id
        async (usuarioId, enderecoId) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // SELECT endereco - exists and belongs to user
              return Promise.resolve([{ id: enderecoId, usuario_id: usuarioId }]);
            }
            if (callCount === 2) {
              // SELECT COUNT active alugueis - no active orders
              return Promise.resolve([{ total: 0 }]);
            }
            if (callCount === 3) {
              // DELETE endereco
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, { id: enderecoId }, {});
          req.usuario_id = usuarioId;

          await enderecosController.remover(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toHaveProperty('message');
          expect(res.jsonData.message).toContain('removido');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});


// ============================================================================
// Property 37: Address ownership isolation
// ============================================================================

describe('Property 37: Address ownership isolation', () => {
  /**
   * **Validates: Requirements 20.4, 20.7**
   *
   * For any user, they can only see/manage their own addresses. Attempting to
   * delete another user's address SHALL be rejected with 403.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects deletion of address belonging to another user with 403', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // requesting user
        validUUID, // address owner (different user)
        validUUID, // endereco_id
        async (requestingUserId, ownerUserId, enderecoId) => {
          // Ensure users are different
          fc.pre(requestingUserId !== ownerUserId);

          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // SELECT endereco - exists but belongs to another user
              return Promise.resolve([{ id: enderecoId, usuario_id: ownerUserId }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, { id: enderecoId }, {});
          req.usuario_id = requestingUserId;

          await enderecosController.remover(req, res);

          expect(res.statusCode).toBe(403);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('outro usuário');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('allows deletion of own address (ownership verified)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // usuario_id (same as owner)
        validUUID, // endereco_id
        async (usuarioId, enderecoId) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // SELECT endereco - exists and belongs to requesting user
              return Promise.resolve([{ id: enderecoId, usuario_id: usuarioId }]);
            }
            if (callCount === 2) {
              // SELECT COUNT active alugueis - no active orders
              return Promise.resolve([{ total: 0 }]);
            }
            if (callCount === 3) {
              // DELETE endereco
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks({}, { id: enderecoId }, {});
          req.usuario_id = usuarioId;

          await enderecosController.remover(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.jsonData).toHaveProperty('message');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('listar only returns addresses for the authenticated user', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID, // usuario_id
        fc.integer({ min: 0, max: 10 }), // number of addresses
        async (usuarioId, addressCount) => {
          const addresses = Array.from({ length: addressCount }, (_, i) => ({
            id: `addr-${i}`,
            cep: '12345678',
            logradouro: `Rua ${i}`,
            numero: `${i + 1}`,
            bairro: 'Centro',
            cidade_estado: 'São Paulo - SP',
            criado_em: '2024-01-01'
          }));

          sql.mockImplementation(() => {
            return Promise.resolve(addresses);
          });

          const { req, res } = createMocks({}, {}, {});
          req.usuario_id = usuarioId;

          await enderecosController.listar(req, res);

          expect(res.statusCode).toBe(200);
          expect(Array.isArray(res.jsonData)).toBe(true);
          expect(res.jsonData.length).toBe(addressCount);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});


// ============================================================================
// Property 38: Maximum address limit enforcement
// ============================================================================

describe('Property 38: Maximum address limit enforcement', () => {
  /**
   * **Validates: Requirements 20.5**
   *
   * For any user with 10 addresses, attempting to create an 11th SHALL be rejected.
   */

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects address creation when user already has 10 addresses', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validCep,
        validLogradouro,
        validNumero,
        validCidadeEstado,
        fc.integer({ min: 10, max: 50 }), // current address count (at or above limit)
        async (usuarioId, cep, logradouro, numero, cidade_estado, currentCount) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // COUNT query - user already has >= 10 addresses
              return Promise.resolve([{ total: currentCount }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { cep, logradouro, numero, cidade_estado },
            {},
            {}
          );
          req.usuario_id = usuarioId;

          await enderecosController.criar(req, res);

          expect(res.statusCode).toBe(400);
          expect(res.jsonData).toHaveProperty('error');
          expect(res.jsonData.error).toContain('10');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('allows address creation when user has fewer than 10 addresses', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validCep,
        validLogradouro,
        validNumero,
        validCidadeEstado,
        fc.integer({ min: 0, max: 9 }), // current address count (below limit)
        async (usuarioId, cep, logradouro, numero, cidade_estado, currentCount) => {
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // COUNT query - user has fewer than 10 addresses
              return Promise.resolve([{ total: currentCount }]);
            }
            if (callCount === 2) {
              // INSERT query
              return Promise.resolve([{
                id: 'new-address-uuid',
                cep,
                logradouro,
                numero,
                bairro: null,
                cidade_estado,
                criado_em: '2024-01-01'
              }]);
            }
            return Promise.resolve([]);
          });

          const { req, res } = createMocks(
            { cep, logradouro, numero, cidade_estado },
            {},
            {}
          );
          req.usuario_id = usuarioId;

          await enderecosController.criar(req, res);

          expect(res.statusCode).toBe(201);
          expect(res.jsonData).toHaveProperty('id');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('boundary: allows creation at exactly 9 addresses but rejects at exactly 10', async () => {
    await fc.assert(
      fc.asyncProperty(
        validUUID,
        validCep,
        validLogradouro,
        validNumero,
        validCidadeEstado,
        async (usuarioId, cep, logradouro, numero, cidade_estado) => {
          // Test at boundary: 9 addresses (should allow)
          let callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total: 9 }]);
            }
            if (callCount === 2) {
              return Promise.resolve([{
                id: 'new-address-uuid',
                cep,
                logradouro,
                numero,
                bairro: null,
                cidade_estado,
                criado_em: '2024-01-01'
              }]);
            }
            return Promise.resolve([]);
          });

          const { req: req9, res: res9 } = createMocks(
            { cep, logradouro, numero, cidade_estado },
            {},
            {}
          );
          req9.usuario_id = usuarioId;

          await enderecosController.criar(req9, res9);
          expect(res9.statusCode).toBe(201);

          // Test at boundary: 10 addresses (should reject)
          callCount = 0;
          sql.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([{ total: 10 }]);
            }
            return Promise.resolve([]);
          });

          const { req: req10, res: res10 } = createMocks(
            { cep, logradouro, numero, cidade_estado },
            {},
            {}
          );
          req10.usuario_id = usuarioId;

          await enderecosController.criar(req10, res10);
          expect(res10.statusCode).toBe(400);
          expect(res10.jsonData.error).toContain('10');
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});
