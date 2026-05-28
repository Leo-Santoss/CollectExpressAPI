// Mock do módulo sql
jest.mock('../../src/config/db', () => jest.fn());
const sql = require('../../src/config/db');

const cacambasController = require('../../src/controllers/cacambasController');

// Helper para criar mock de req/res
function createMocks({ body = {}, params = {}, query = {}, usuario_id, tipo_perfil } = {}) {
  const req = {
    body,
    params,
    query,
    usuario_id: usuario_id || 'user-uuid-1',
    tipo_perfil: tipo_perfil || 'CACAMBEIRO'
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
  return { req, res };
}

describe('cacambasController.listar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve retornar lista paginada com dados, total, page e totalPages', async () => {
    // Mock count query
    sql.mockResolvedValueOnce([{ total: 2 }]);
    // Mock data query
    sql.mockResolvedValueOnce([
      { id: 'c1', nome: 'Caçamba A', disponivel: true },
      { id: 'c2', nome: 'Caçamba B', disponivel: true }
    ]);

    const { req, res } = createMocks({ query: {} });
    await cacambasController.listar(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData).toHaveProperty('data');
    expect(res.jsonData).toHaveProperty('total', 2);
    expect(res.jsonData).toHaveProperty('page', 1);
    expect(res.jsonData).toHaveProperty('totalPages', 1);
    expect(res.jsonData.data).toHaveLength(2);
  });

  it('deve usar page 1 como padrão quando não informado', async () => {
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({ query: {} });
    await cacambasController.listar(req, res);

    expect(res.jsonData.page).toBe(1);
  });

  it('deve aplicar filtro tipo_residuo', async () => {
    sql.mockResolvedValueOnce([{ total: 1 }]);
    sql.mockResolvedValueOnce([{ id: 'c1', tipo_residuo: 'Entulho' }]);

    const { req, res } = createMocks({ query: { tipo_residuo: 'Entulho' } });
    await cacambasController.listar(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.total).toBe(1);
  });

  it('deve aplicar filtro cacambeiro_id', async () => {
    sql.mockResolvedValueOnce([{ total: 1 }]);
    sql.mockResolvedValueOnce([{ id: 'c1', cacambeiro_id: 'cac-1' }]);

    const { req, res } = createMocks({ query: { cacambeiro_id: 'cac-1' } });
    await cacambasController.listar(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.total).toBe(1);
  });

  it('deve aplicar busca quando search tem 3+ caracteres', async () => {
    sql.mockResolvedValueOnce([{ total: 1 }]);
    sql.mockResolvedValueOnce([{ id: 'c1', nome: 'Caçamba Grande' }]);

    const { req, res } = createMocks({ query: { search: 'gra' } });
    await cacambasController.listar(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.total).toBe(1);
  });

  it('deve ignorar busca quando search tem menos de 3 caracteres', async () => {
    sql.mockResolvedValueOnce([{ total: 5 }]);
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({ query: { search: 'ab' } });
    await cacambasController.listar(req, res);

    expect(res.statusCode).toBe(200);
    // Should not apply search filter (treated as no filter)
  });

  it('deve retornar 500 em caso de erro interno', async () => {
    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks({ query: {} });
    await cacambasController.listar(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.jsonData.error).toContain('Erro interno');
  });
});

describe('cacambasController.detalhe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve retornar detalhes completos da caçamba com info do cacambeiro e avaliações', async () => {
    // Mock cacamba query
    sql.mockResolvedValueOnce([{
      id: 'c1',
      cacambeiro_id: 'cac-1',
      nome: 'Caçamba Teste',
      tipo_residuo: 'Entulho',
      tamanho_m3: 5.0,
      preco_diaria: 150.00,
      foto_url: null,
      disponivel: true,
      criado_em: '2024-01-01',
      cacambeiro_nome_completo: 'João Cacambeiro',
      cacambeiro_telefone: '11999999999',
      cacambeiro_horario_inicio: '08:00',
      cacambeiro_horario_fim: '18:00',
      cacambeiro_raio_entrega_km: 20,
      cacambeiro_taxa_entrega: 50.00
    }]);
    // Mock nota_media query
    sql.mockResolvedValueOnce([{ nota_media: 4.5 }]);
    // Mock avaliacoes query
    sql.mockResolvedValueOnce([
      { nota: 5, comentario: 'Ótimo!', data_avaliacao: '2024-01-10', nome_completo: 'Maria' }
    ]);

    const { req, res } = createMocks({ params: { id: 'c1' } });
    await cacambasController.detalhe(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.id).toBe('c1');
    expect(res.jsonData.cacambeiro).toEqual({
      nome_completo: 'João Cacambeiro',
      telefone: '11999999999',
      horario_inicio: '08:00',
      horario_fim: '18:00',
      raio_entrega_km: 20,
      nota_media: 4.5,
      taxa_entrega: 50.00
    });
    expect(res.jsonData.avaliacoes).toHaveLength(1);
    expect(res.jsonData.avaliacoes[0].nota).toBe(5);
  });

  it('deve retornar 404 quando caçamba não existe', async () => {
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({ params: { id: 'inexistente' } });
    await cacambasController.detalhe(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.jsonData.error).toContain('não encontrada');
  });

  it('deve retornar nota_media null quando não há avaliações', async () => {
    sql.mockResolvedValueOnce([{
      id: 'c1',
      cacambeiro_id: 'cac-1',
      nome: 'Caçamba',
      tipo_residuo: 'Entulho',
      tamanho_m3: 5.0,
      preco_diaria: 100.00,
      foto_url: null,
      disponivel: true,
      criado_em: '2024-01-01',
      cacambeiro_nome_completo: 'João',
      cacambeiro_telefone: '11999999999',
      cacambeiro_horario_inicio: '08:00',
      cacambeiro_horario_fim: '18:00',
      cacambeiro_raio_entrega_km: 20,
      cacambeiro_taxa_entrega: 50.00
    }]);
    sql.mockResolvedValueOnce([{ nota_media: null }]);
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({ params: { id: 'c1' } });
    await cacambasController.detalhe(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.cacambeiro.nota_media).toBeNull();
    expect(res.jsonData.avaliacoes).toHaveLength(0);
  });

  it('deve retornar 500 em caso de erro interno', async () => {
    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks({ params: { id: 'c1' } });
    await cacambasController.detalhe(req, res);

    expect(res.statusCode).toBe(500);
  });
});

describe('cacambasController.criar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve criar caçamba com disponivel=true e retornar 201', async () => {
    const novaCacamba = {
      id: 'new-uuid',
      cacambeiro_id: 'user-uuid-1',
      nome: 'Caçamba Nova',
      tipo_residuo: 'Entulho',
      tamanho_m3: 5.0,
      preco_diaria: 150.00,
      foto_url: null,
      disponivel: true,
      criado_em: '2024-01-01'
    };

    sql.mockResolvedValueOnce([novaCacamba]);

    const { req, res } = createMocks({
      body: {
        nome: 'Caçamba Nova',
        tipo_residuo: 'Entulho',
        tamanho_m3: 5.0,
        preco_diaria: 150.00
      },
      usuario_id: 'user-uuid-1'
    });
    await cacambasController.criar(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonData.id).toBe('new-uuid');
    expect(res.jsonData.disponivel).toBe(true);
  });

  it('deve retornar 500 em caso de erro interno', async () => {
    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks({
      body: {
        nome: 'Caçamba',
        tipo_residuo: 'Entulho',
        tamanho_m3: 5.0,
        preco_diaria: 100.00
      }
    });
    await cacambasController.criar(req, res);

    expect(res.statusCode).toBe(500);
  });
});

describe('cacambasController.atualizar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve atualizar caçamba do próprio cacambeiro e retornar 200', async () => {
    // Mock: caçamba existe e pertence ao usuário
    sql.mockResolvedValueOnce([{ id: 'c1', cacambeiro_id: 'user-uuid-1' }]);
    // Mock: update retorna resultado
    sql.mockResolvedValueOnce([{
      id: 'c1',
      cacambeiro_id: 'user-uuid-1',
      preco_diaria: 200.00,
      disponivel: true
    }]);

    const { req, res } = createMocks({
      params: { id: 'c1' },
      body: { preco_diaria: 200.00 },
      usuario_id: 'user-uuid-1'
    });
    await cacambasController.atualizar(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.preco_diaria).toBe(200.00);
  });

  it('deve retornar 404 quando caçamba não existe', async () => {
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({
      params: { id: 'inexistente' },
      body: { preco_diaria: 200.00 },
      usuario_id: 'user-uuid-1'
    });
    await cacambasController.atualizar(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('deve retornar 403 quando não é o dono', async () => {
    sql.mockResolvedValueOnce([{ id: 'c1', cacambeiro_id: 'outro-usuario' }]);

    const { req, res } = createMocks({
      params: { id: 'c1' },
      body: { preco_diaria: 200.00 },
      usuario_id: 'user-uuid-1'
    });
    await cacambasController.atualizar(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData.error).toContain('não autorizado');
  });

  it('deve retornar 500 em caso de erro interno', async () => {
    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks({
      params: { id: 'c1' },
      body: { preco_diaria: 200.00 }
    });
    await cacambasController.atualizar(req, res);

    expect(res.statusCode).toBe(500);
  });
});

describe('cacambasController.remover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve remover caçamba sem pedidos ativos e retornar 200', async () => {
    // Mock: caçamba existe e pertence ao usuário
    sql.mockResolvedValueOnce([{ id: 'c1', cacambeiro_id: 'user-uuid-1' }]);
    // Mock: sem pedidos ativos
    sql.mockResolvedValueOnce([{ count: 0 }]);
    // Mock: delete
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({
      params: { id: 'c1' },
      usuario_id: 'user-uuid-1'
    });
    await cacambasController.remover(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.message).toContain('removida');
  });

  it('deve retornar 400 quando existem pedidos ativos', async () => {
    sql.mockResolvedValueOnce([{ id: 'c1', cacambeiro_id: 'user-uuid-1' }]);
    sql.mockResolvedValueOnce([{ count: 2 }]);

    const { req, res } = createMocks({
      params: { id: 'c1' },
      usuario_id: 'user-uuid-1'
    });
    await cacambasController.remover(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('pedidos ativos');
  });

  it('deve retornar 404 quando caçamba não existe', async () => {
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({
      params: { id: 'inexistente' },
      usuario_id: 'user-uuid-1'
    });
    await cacambasController.remover(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('deve retornar 403 quando não é o dono', async () => {
    sql.mockResolvedValueOnce([{ id: 'c1', cacambeiro_id: 'outro-usuario' }]);

    const { req, res } = createMocks({
      params: { id: 'c1' },
      usuario_id: 'user-uuid-1'
    });
    await cacambasController.remover(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData.error).toContain('não autorizado');
  });

  it('deve retornar 500 em caso de erro interno', async () => {
    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks({
      params: { id: 'c1' },
      usuario_id: 'user-uuid-1'
    });
    await cacambasController.remover(req, res);

    expect(res.statusCode).toBe(500);
  });
});
