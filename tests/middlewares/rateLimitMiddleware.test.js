const {
  rateLimitMiddleware,
  recordFailedAttempt,
  resetAttempts,
  getClientIp
} = require('../../src/middlewares/rateLimitMiddleware');

// Helper para criar mock de req/res/next
function createMocks(ip = '127.0.0.1') {
  const req = {
    ip,
    connection: { remoteAddress: ip }
  };
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

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    // Limpa o Map de tentativas antes de cada teste
    rateLimitMiddleware._attempts.clear();
  });

  describe('getClientIp', () => {
    it('deve retornar req.ip quando disponível', () => {
      const req = { ip: '192.168.1.1', connection: { remoteAddress: '10.0.0.1' } };
      expect(getClientIp(req)).toBe('192.168.1.1');
    });

    it('deve retornar connection.remoteAddress quando req.ip não existe', () => {
      const req = { ip: undefined, connection: { remoteAddress: '10.0.0.1' } };
      expect(getClientIp(req)).toBe('10.0.0.1');
    });

    it('deve retornar "unknown" quando nenhum IP está disponível', () => {
      const req = { ip: undefined, connection: {} };
      expect(getClientIp(req)).toBe('unknown');
    });
  });

  describe('middleware - permite requisições sem tentativas anteriores', () => {
    it('deve chamar next() quando IP não tem tentativas registradas', () => {
      const { req, res, next } = createMocks('10.0.0.1');
      rateLimitMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });
  });

  describe('middleware - permite requisições abaixo do limite', () => {
    it('deve chamar next() após 4 tentativas falhadas (abaixo do limite de 5)', () => {
      const ip = '10.0.0.2';
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt(ip);
      }

      const { req, res, next } = createMocks(ip);
      rateLimitMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });
  });

  describe('middleware - bloqueia após atingir o limite', () => {
    it('deve retornar 429 após 5 tentativas falhadas', () => {
      const ip = '10.0.0.3';
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(ip);
      }

      const { req, res, next } = createMocks(ip);
      rateLimitMiddleware(req, res, next);
      expect(res.statusCode).toBe(429);
      expect(next).not.toHaveBeenCalled();
    });

    it('deve incluir mensagem de erro em português', () => {
      const ip = '10.0.0.4';
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(ip);
      }

      const { req, res, next } = createMocks(ip);
      rateLimitMiddleware(req, res, next);
      expect(res.jsonData.error).toMatch(/Muitas tentativas de login/);
      expect(res.jsonData.error).toMatch(/Tente novamente em \d+ minutos/);
    });

    it('deve incluir retry_after em segundos', () => {
      const ip = '10.0.0.5';
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(ip);
      }

      const { req, res, next } = createMocks(ip);
      rateLimitMiddleware(req, res, next);
      expect(res.jsonData.retry_after).toBeGreaterThan(0);
      expect(res.jsonData.retry_after).toBeLessThanOrEqual(15 * 60);
    });
  });

  describe('middleware - janela de tempo', () => {
    it('deve permitir requisição quando a janela de 15 minutos expirou', () => {
      const ip = '10.0.0.6';
      // Simula tentativas com firstAttempt no passado (16 minutos atrás)
      rateLimitMiddleware._attempts.set(ip, {
        attempts: 5,
        firstAttempt: Date.now() - (16 * 60 * 1000)
      });

      const { req, res, next } = createMocks(ip);
      rateLimitMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });

    it('deve limpar o registro quando a janela expira', () => {
      const ip = '10.0.0.7';
      rateLimitMiddleware._attempts.set(ip, {
        attempts: 5,
        firstAttempt: Date.now() - (16 * 60 * 1000)
      });

      const { req, res, next } = createMocks(ip);
      rateLimitMiddleware(req, res, next);
      expect(rateLimitMiddleware._attempts.has(ip)).toBe(false);
    });
  });

  describe('recordFailedAttempt', () => {
    it('deve criar registro na primeira tentativa', () => {
      const ip = '10.0.0.8';
      recordFailedAttempt(ip);
      const record = rateLimitMiddleware._attempts.get(ip);
      expect(record).toBeDefined();
      expect(record.attempts).toBe(1);
    });

    it('deve incrementar tentativas em chamadas subsequentes', () => {
      const ip = '10.0.0.9';
      recordFailedAttempt(ip);
      recordFailedAttempt(ip);
      recordFailedAttempt(ip);
      const record = rateLimitMiddleware._attempts.get(ip);
      expect(record.attempts).toBe(3);
    });

    it('deve reiniciar contagem quando janela expirou', () => {
      const ip = '10.0.0.10';
      // Simula registro antigo
      rateLimitMiddleware._attempts.set(ip, {
        attempts: 4,
        firstAttempt: Date.now() - (16 * 60 * 1000)
      });

      recordFailedAttempt(ip);
      const record = rateLimitMiddleware._attempts.get(ip);
      expect(record.attempts).toBe(1);
    });
  });

  describe('resetAttempts', () => {
    it('deve remover o registro de tentativas para o IP', () => {
      const ip = '10.0.0.11';
      recordFailedAttempt(ip);
      recordFailedAttempt(ip);
      expect(rateLimitMiddleware._attempts.has(ip)).toBe(true);

      resetAttempts(ip);
      expect(rateLimitMiddleware._attempts.has(ip)).toBe(false);
    });

    it('não deve lançar erro para IP sem registro', () => {
      expect(() => resetAttempts('10.0.0.99')).not.toThrow();
    });
  });

  describe('isolamento entre IPs', () => {
    it('deve rastrear tentativas independentemente por IP', () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      // IP1 atinge o limite
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(ip1);
      }

      // IP2 tem apenas 2 tentativas
      recordFailedAttempt(ip2);
      recordFailedAttempt(ip2);

      // IP1 deve ser bloqueado
      const { req: req1, res: res1, next: next1 } = createMocks(ip1);
      rateLimitMiddleware(req1, res1, next1);
      expect(res1.statusCode).toBe(429);

      // IP2 deve passar
      const { req: req2, res: res2, next: next2 } = createMocks(ip2);
      rateLimitMiddleware(req2, res2, next2);
      expect(next2).toHaveBeenCalled();
      expect(res2.statusCode).toBeNull();
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('deve remover entradas expiradas', () => {
      const ip1 = '10.0.0.20';
      const ip2 = '10.0.0.21';

      // IP1: entrada expirada (16 min atrás)
      rateLimitMiddleware._attempts.set(ip1, {
        attempts: 3,
        firstAttempt: Date.now() - (16 * 60 * 1000)
      });

      // IP2: entrada recente
      rateLimitMiddleware._attempts.set(ip2, {
        attempts: 2,
        firstAttempt: Date.now()
      });

      rateLimitMiddleware._cleanupExpiredEntries();

      expect(rateLimitMiddleware._attempts.has(ip1)).toBe(false);
      expect(rateLimitMiddleware._attempts.has(ip2)).toBe(true);
    });
  });
});
