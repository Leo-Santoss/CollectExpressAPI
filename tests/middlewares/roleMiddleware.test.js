const roleMiddleware = require('../../src/middlewares/roleMiddleware');

// Helper para criar mock de req/res/next
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

describe('roleMiddleware', () => {
  describe('single role', () => {
    const middleware = roleMiddleware(['CACAMBEIRO']);

    it('deve permitir acesso quando tipo_perfil está na lista de roles permitidos', () => {
      const { req, res, next } = createMocks('CACAMBEIRO');
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });

    it('deve retornar 403 quando tipo_perfil não está na lista de roles permitidos', () => {
      const { req, res, next } = createMocks('CONSUMIDOR');
      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toEqual({ error: "Acesso não autorizado" });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 403 para ADMIN quando apenas CACAMBEIRO é permitido', () => {
      const { req, res, next } = createMocks('ADMIN');
      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toEqual({ error: "Acesso não autorizado" });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('multiple roles', () => {
    const middleware = roleMiddleware(['CACAMBEIRO', 'ADMIN']);

    it('deve permitir acesso para CACAMBEIRO', () => {
      const { req, res, next } = createMocks('CACAMBEIRO');
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });

    it('deve permitir acesso para ADMIN', () => {
      const { req, res, next } = createMocks('ADMIN');
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });

    it('deve retornar 403 para CONSUMIDOR quando apenas CACAMBEIRO e ADMIN são permitidos', () => {
      const { req, res, next } = createMocks('CONSUMIDOR');
      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toEqual({ error: "Acesso não autorizado" });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('ADMIN only', () => {
    const middleware = roleMiddleware(['ADMIN']);

    it('deve permitir acesso para ADMIN', () => {
      const { req, res, next } = createMocks('ADMIN');
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('deve retornar 403 para CACAMBEIRO', () => {
      const { req, res, next } = createMocks('CACAMBEIRO');
      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 403 para CONSUMIDOR', () => {
      const { req, res, next } = createMocks('CONSUMIDOR');
      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('deve retornar 403 quando tipo_perfil é undefined', () => {
      const { req, res, next } = createMocks(undefined);
      const middleware = roleMiddleware(['ADMIN']);
      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toEqual({ error: "Acesso não autorizado" });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 403 quando tipo_perfil é null', () => {
      const { req, res, next } = createMocks(null);
      const middleware = roleMiddleware(['ADMIN']);
      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('deve ser case-sensitive na comparação de roles', () => {
      const { req, res, next } = createMocks('admin');
      const middleware = roleMiddleware(['ADMIN']);
      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
