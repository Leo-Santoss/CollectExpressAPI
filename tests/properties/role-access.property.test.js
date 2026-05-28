const fc = require('fast-check');
const roleMiddleware = require('../../src/middlewares/roleMiddleware');

/**
 * Property 26: Role-based access control enforcement
 *
 * For ANY API endpoint restricted to a specific role (CACAMBEIRO or ADMIN),
 * requests from users with a different tipo_perfil SHALL receive a 403 forbidden response.
 * Specifically: dumpster creation requires CACAMBEIRO, order management requires CACAMBEIRO,
 * admin endpoints require ADMIN.
 *
 * **Validates: Requirements 10.7, 11.5, 12.6, 14.4, 15.1, 16.5, 17.2**
 */

const ALL_ROLES = ['CONSUMIDOR', 'CACAMBEIRO', 'ADMIN'];

/**
 * Helper to create mock req/res/next objects
 */
function createMocks(tipoPerfil) {
  const req = { tipo_perfil: tipoPerfil };
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

/**
 * Arbitrary: generates a non-empty subset of ALL_ROLES as allowed roles
 */
const allowedRolesArb = fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 3 });

/**
 * Arbitrary: generates a valid tipo_perfil from the known roles
 */
const validRoleArb = fc.constantFrom(...ALL_ROLES);

/**
 * Arbitrary: generates invalid/edge-case tipo_perfil values
 */
const invalidRoleArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.constant(''),
  fc.string().filter(s => !ALL_ROLES.includes(s))
);

describe('Property 26: Role-based access control enforcement', () => {
  it('should return 403 when tipo_perfil is NOT in allowed roles', () => {
    fc.assert(
      fc.property(
        allowedRolesArb,
        validRoleArb,
        (allowedRoles, userRole) => {
          // Pre-condition: user role is NOT in allowed roles
          fc.pre(!allowedRoles.includes(userRole));

          const middleware = roleMiddleware(allowedRoles);
          const { req, res, next } = createMocks(userRole);

          middleware(req, res, next);

          expect(res.statusCode).toBe(403);
          expect(res.jsonData).toEqual({ error: 'Acesso não autorizado' });
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 200 }
    );
  });

  it('should call next() when tipo_perfil IS in allowed roles', () => {
    fc.assert(
      fc.property(
        allowedRolesArb,
        (allowedRoles) => {
          // Pick a role that IS in the allowed list
          const userRole = allowedRoles[0];

          const middleware = roleMiddleware(allowedRoles);
          const { req, res, next } = createMocks(userRole);

          middleware(req, res, next);

          expect(next).toHaveBeenCalled();
          expect(res.statusCode).toBeNull();
        }
      ),
      { numRuns: 200 }
    );
  });

  it('should return 403 for undefined, null, empty string, or random string tipo_perfil', () => {
    fc.assert(
      fc.property(
        allowedRolesArb,
        invalidRoleArb,
        (allowedRoles, invalidRole) => {
          const middleware = roleMiddleware(allowedRoles);
          const { req, res, next } = createMocks(invalidRole);

          middleware(req, res, next);

          expect(res.statusCode).toBe(403);
          expect(res.jsonData).toEqual({ error: 'Acesso não autorizado' });
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 200 }
    );
  });

  it('CACAMBEIRO-only endpoints reject CONSUMIDOR and ADMIN', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('CONSUMIDOR', 'ADMIN'),
        (userRole) => {
          const middleware = roleMiddleware(['CACAMBEIRO']);
          const { req, res, next } = createMocks(userRole);

          middleware(req, res, next);

          expect(res.statusCode).toBe(403);
          expect(res.jsonData).toEqual({ error: 'Acesso não autorizado' });
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('ADMIN-only endpoints reject CONSUMIDOR and CACAMBEIRO', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('CONSUMIDOR', 'CACAMBEIRO'),
        (userRole) => {
          const middleware = roleMiddleware(['ADMIN']);
          const { req, res, next } = createMocks(userRole);

          middleware(req, res, next);

          expect(res.statusCode).toBe(403);
          expect(res.jsonData).toEqual({ error: 'Acesso não autorizado' });
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('access control is deterministic: same input always produces same result', () => {
    fc.assert(
      fc.property(
        allowedRolesArb,
        fc.oneof(validRoleArb, invalidRoleArb),
        (allowedRoles, userRole) => {
          const middleware = roleMiddleware(allowedRoles);

          const { req: req1, res: res1, next: next1 } = createMocks(userRole);
          const { req: req2, res: res2, next: next2 } = createMocks(userRole);

          middleware(req1, res1, next1);
          middleware(req2, res2, next2);

          // Both calls should produce identical results
          expect(res1.statusCode).toBe(res2.statusCode);
          expect(res1.jsonData).toEqual(res2.jsonData);
          expect(next1).toHaveBeenCalledTimes(next2.mock.calls.length);
        }
      ),
      { numRuns: 200 }
    );
  });
});
