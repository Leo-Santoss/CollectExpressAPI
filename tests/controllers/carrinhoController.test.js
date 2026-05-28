// Mock do módulo sql
jest.mock('../../src/config/db', () => jest.fn());
const sql = require('../../src/config/db');

const carrinhoController = require('../../src/controllers/carrinhoController');

// Helper para criar mock de req/res
function createMocks({ body = {}, params = {}, query = {}, usuario_id, tipo_perfil } = {}) {
  const req = {
    body,
    params,
    query,
    usuario_id: usuario_id || 'consumidor-uuid-1',
    tipo_perfil: tipo_perfil || 'CONSUMIDOR'
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

describe('carrinhoController.obter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve retornar carrinho vazio quando não existe carrinho', async () => {
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks();
    await carrinhoController.obter(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData).toEqual({
      id: null,
      consumidor_id: 'consumidor-uuid-1',
      cacambeiro_id: null,
      itens: []
    });
  });

  it('deve retornar carrinho com itens e detalhes das caçambas', async () => {
    // Mock: carrinho existe
    sql.mockResolvedValueOnce([{
      id: 'carrinho-1',
      consumidor_id: 'consumidor-uuid-1',
      cacambeiro_id: 'cacambeiro-1',
      criado_em: '2024-01-01'
    }]);
    // Mock: itens com detalhes
    sql.mockResolvedValueOnce([
      {
        id: 'item-1',
        cacamba_id: 'cacamba-1',
        quantidade: 2,
        dias_aluguel: 7,
        nome: 'Caçamba 5m³',
        tipo_residuo: 'Entulho',
        preco_diaria: 150.00
      }
    ]);

    const { req, res } = createMocks();
    await carrinhoController.obter(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.id).toBe('carrinho-1');
    expect(res.jsonData.cacambeiro_id).toBe('cacambeiro-1');
    expect(res.jsonData.itens).toHaveLength(1);
    expect(res.jsonData.itens[0]).toEqual({
      id: 'item-1',
      cacamba_id: 'cacamba-1',
      quantidade: 2,
      dias_aluguel: 7,
      nome: 'Caçamba 5m³',
      tipo_residuo: 'Entulho',
      preco_diaria: 150.00
    });
  });

  it('deve retornar 500 em caso de erro interno', async () => {
    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks();
    await carrinhoController.obter(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.jsonData.error).toContain('Erro interno');
  });
});

describe('carrinhoController.adicionarItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve adicionar item e criar carrinho quando não existe', async () => {
    // Mock: buscar caçamba (retorna cacambeiro_id)
    sql.mockResolvedValueOnce([{ id: 'cacamba-1', cacambeiro_id: 'cacambeiro-1' }]);
    // Mock: buscar carrinho existente (não existe)
    sql.mockResolvedValueOnce([]);
    // Mock: criar carrinho
    sql.mockResolvedValueOnce([{ id: 'carrinho-novo', cacambeiro_id: 'cacambeiro-1' }]);
    // Mock: inserir item
    sql.mockResolvedValueOnce([{ id: 'item-1' }]);
    // Mock: buscar itens atualizados
    sql.mockResolvedValueOnce([{
      id: 'item-1',
      cacamba_id: 'cacamba-1',
      quantidade: 3,
      dias_aluguel: 14,
      nome: 'Caçamba 5m³',
      tipo_residuo: 'Entulho',
      preco_diaria: 150.00
    }]);

    const { req, res } = createMocks({
      body: { cacamba_id: 'cacamba-1', quantidade: 3, dias_aluguel: 14 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonData.id).toBe('carrinho-novo');
    expect(res.jsonData.cacambeiro_id).toBe('cacambeiro-1');
    expect(res.jsonData.itens).toHaveLength(1);
  });

  it('deve adicionar item ao carrinho existente do mesmo cacambeiro', async () => {
    // Mock: buscar caçamba
    sql.mockResolvedValueOnce([{ id: 'cacamba-2', cacambeiro_id: 'cacambeiro-1' }]);
    // Mock: carrinho existente (mesmo cacambeiro)
    sql.mockResolvedValueOnce([{ id: 'carrinho-1', cacambeiro_id: 'cacambeiro-1' }]);
    // Mock: inserir item
    sql.mockResolvedValueOnce([{ id: 'item-2' }]);
    // Mock: buscar itens atualizados
    sql.mockResolvedValueOnce([
      { id: 'item-1', cacamba_id: 'cacamba-1', quantidade: 2, dias_aluguel: 7, nome: 'Caçamba A', tipo_residuo: 'Entulho', preco_diaria: 100 },
      { id: 'item-2', cacamba_id: 'cacamba-2', quantidade: 1, dias_aluguel: 5, nome: 'Caçamba B', tipo_residuo: 'Madeira', preco_diaria: 120 }
    ]);

    const { req, res } = createMocks({
      body: { cacamba_id: 'cacamba-2', quantidade: 1, dias_aluguel: 5 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonData.itens).toHaveLength(2);
  });

  it('deve rejeitar item de cacambeiro diferente com status 400', async () => {
    // Mock: buscar caçamba (cacambeiro diferente)
    sql.mockResolvedValueOnce([{ id: 'cacamba-3', cacambeiro_id: 'cacambeiro-2' }]);
    // Mock: carrinho existente (cacambeiro-1)
    sql.mockResolvedValueOnce([{ id: 'carrinho-1', cacambeiro_id: 'cacambeiro-1' }]);

    const { req, res } = createMocks({
      body: { cacamba_id: 'cacamba-3', quantidade: 1, dias_aluguel: 7 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('mesmo caçambeiro');
  });

  it('deve rejeitar quando cacamba_id não é fornecido', async () => {
    const { req, res } = createMocks({
      body: { quantidade: 1, dias_aluguel: 7 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('cacamba_id');
  });

  it('deve rejeitar quantidade menor que 1', async () => {
    const { req, res } = createMocks({
      body: { cacamba_id: 'cacamba-1', quantidade: 0, dias_aluguel: 7 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('quantidade');
  });

  it('deve rejeitar quantidade maior que 10', async () => {
    const { req, res } = createMocks({
      body: { cacamba_id: 'cacamba-1', quantidade: 11, dias_aluguel: 7 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('quantidade');
  });

  it('deve rejeitar quantidade não inteira', async () => {
    const { req, res } = createMocks({
      body: { cacamba_id: 'cacamba-1', quantidade: 2.5, dias_aluguel: 7 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('quantidade');
  });

  it('deve rejeitar dias_aluguel menor que 1', async () => {
    const { req, res } = createMocks({
      body: { cacamba_id: 'cacamba-1', quantidade: 1, dias_aluguel: 0 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('dias_aluguel');
  });

  it('deve rejeitar dias_aluguel maior que 90', async () => {
    const { req, res } = createMocks({
      body: { cacamba_id: 'cacamba-1', quantidade: 1, dias_aluguel: 91 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('dias_aluguel');
  });

  it('deve rejeitar dias_aluguel não inteiro', async () => {
    const { req, res } = createMocks({
      body: { cacamba_id: 'cacamba-1', quantidade: 1, dias_aluguel: 7.5 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('dias_aluguel');
  });

  it('deve retornar 404 quando caçamba não existe', async () => {
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({
      body: { cacamba_id: 'inexistente', quantidade: 1, dias_aluguel: 7 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.jsonData.error).toContain('não encontrada');
  });

  it('deve retornar 500 em caso de erro interno', async () => {
    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks({
      body: { cacamba_id: 'cacamba-1', quantidade: 1, dias_aluguel: 7 }
    });
    await carrinhoController.adicionarItem(req, res);

    expect(res.statusCode).toBe(500);
  });
});

describe('carrinhoController.atualizarItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve atualizar quantidade do item e retornar carrinho atualizado', async () => {
    // Mock: verificar item pertence ao carrinho do consumidor
    sql.mockResolvedValueOnce([{ id: 'item-1', carrinho_id: 'carrinho-1' }]);
    // Mock: update
    sql.mockResolvedValueOnce([]);
    // Mock: buscar carrinho
    sql.mockResolvedValueOnce([{ id: 'carrinho-1', consumidor_id: 'consumidor-uuid-1', cacambeiro_id: 'cacambeiro-1' }]);
    // Mock: buscar itens atualizados
    sql.mockResolvedValueOnce([{
      id: 'item-1',
      cacamba_id: 'cacamba-1',
      quantidade: 5,
      dias_aluguel: 7,
      nome: 'Caçamba 5m³',
      tipo_residuo: 'Entulho',
      preco_diaria: 150.00
    }]);

    const { req, res } = createMocks({
      params: { id: 'item-1' },
      body: { quantidade: 5 }
    });
    await carrinhoController.atualizarItem(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.itens[0].quantidade).toBe(5);
  });

  it('deve rejeitar quantidade menor que 1', async () => {
    const { req, res } = createMocks({
      params: { id: 'item-1' },
      body: { quantidade: 0 }
    });
    await carrinhoController.atualizarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('quantidade');
  });

  it('deve rejeitar quantidade maior que 10', async () => {
    const { req, res } = createMocks({
      params: { id: 'item-1' },
      body: { quantidade: 11 }
    });
    await carrinhoController.atualizarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('quantidade');
  });

  it('deve rejeitar quantidade não inteira', async () => {
    const { req, res } = createMocks({
      params: { id: 'item-1' },
      body: { quantidade: 3.5 }
    });
    await carrinhoController.atualizarItem(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('quantidade');
  });

  it('deve retornar 404 quando item não pertence ao carrinho do consumidor', async () => {
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks({
      params: { id: 'item-inexistente' },
      body: { quantidade: 3 }
    });
    await carrinhoController.atualizarItem(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.jsonData.error).toContain('não encontrado');
  });

  it('deve retornar 500 em caso de erro interno', async () => {
    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks({
      params: { id: 'item-1' },
      body: { quantidade: 3 }
    });
    await carrinhoController.atualizarItem(req, res);

    expect(res.statusCode).toBe(500);
  });
});

describe('carrinhoController.limpar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve limpar carrinho existente e retornar mensagem de sucesso', async () => {
    // Mock: carrinho existe
    sql.mockResolvedValueOnce([{ id: 'carrinho-1' }]);
    // Mock: delete itens
    sql.mockResolvedValueOnce([]);
    // Mock: delete carrinho
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks();
    await carrinhoController.limpar(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.message).toBe('Carrinho limpo com sucesso');
  });

  it('deve retornar sucesso mesmo quando carrinho não existe', async () => {
    sql.mockResolvedValueOnce([]);

    const { req, res } = createMocks();
    await carrinhoController.limpar(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.message).toBe('Carrinho limpo com sucesso');
  });

  it('deve retornar 500 em caso de erro interno', async () => {
    sql.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = createMocks();
    await carrinhoController.limpar(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.jsonData.error).toContain('Erro interno');
  });
});
