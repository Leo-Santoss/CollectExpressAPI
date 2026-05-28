const alugueisController = require("../../src/controllers/alugueisController");

// Mock do módulo de banco de dados
jest.mock("../../src/config/db", () => {
  const mockSql = jest.fn();
  return mockSql;
});

const sql = require("../../src/config/db");

function createReq(overrides = {}) {
  return {
    usuario_id: "consumer-uuid-123",
    tipo_perfil: "CONSUMIDOR",
    body: {
      endereco_id: "endereco-uuid-456",
      data_inicio: getFutureDate(5),
      dias_aluguel: 7,
      ...overrides
    }
  };
}

function createRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function getFutureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

describe("alugueisController.checkout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deve retornar 400 quando o carrinho não existe", async () => {
    sql.mockResolvedValueOnce([]); // carrinho vazio

    const req = createReq();
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O carrinho está vazio" });
  });

  it("deve retornar 400 quando o carrinho existe mas não tem itens", async () => {
    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    sql.mockResolvedValueOnce([]); // itens vazios

    const req = createReq();
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O carrinho está vazio" });
  });

  it("deve retornar 400 quando endereco_id não é fornecido", async () => {
    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    sql.mockResolvedValueOnce([{ id: "item-1", cacamba_id: "c1", quantidade: 1, dias_aluguel: 7, preco_diaria: 100 }]);

    const req = createReq({ endereco_id: null });
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O campo 'endereco_id' é obrigatório" });
  });

  it("deve retornar 400 quando data_inicio não é fornecida", async () => {
    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    sql.mockResolvedValueOnce([{ id: "item-1", cacamba_id: "c1", quantidade: 1, dias_aluguel: 7, preco_diaria: 100 }]);

    const req = createReq({ data_inicio: null });
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O campo 'data_inicio' deve ser entre 1 e 60 dias a partir de hoje" });
  });

  it("deve retornar 400 quando data_inicio é hoje (menos de 1 dia)", async () => {
    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    sql.mockResolvedValueOnce([{ id: "item-1", cacamba_id: "c1", quantidade: 1, dias_aluguel: 7, preco_diaria: 100 }]);

    const hoje = new Date().toISOString().split("T")[0];
    const req = createReq({ data_inicio: hoje });
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O campo 'data_inicio' deve ser entre 1 e 60 dias a partir de hoje" });
  });

  it("deve retornar 400 quando data_inicio é mais de 60 dias no futuro", async () => {
    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    sql.mockResolvedValueOnce([{ id: "item-1", cacamba_id: "c1", quantidade: 1, dias_aluguel: 7, preco_diaria: 100 }]);

    const req = createReq({ data_inicio: getFutureDate(61) });
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O campo 'data_inicio' deve ser entre 1 e 60 dias a partir de hoje" });
  });

  it("deve retornar 400 quando dias_aluguel é menor que 1", async () => {
    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    sql.mockResolvedValueOnce([{ id: "item-1", cacamba_id: "c1", quantidade: 1, dias_aluguel: 7, preco_diaria: 100 }]);

    const req = createReq({ dias_aluguel: 0 });
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O campo 'dias_aluguel' deve ser um inteiro entre 1 e 30" });
  });

  it("deve retornar 400 quando dias_aluguel é maior que 30", async () => {
    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    sql.mockResolvedValueOnce([{ id: "item-1", cacamba_id: "c1", quantidade: 1, dias_aluguel: 7, preco_diaria: 100 }]);

    const req = createReq({ dias_aluguel: 31 });
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O campo 'dias_aluguel' deve ser um inteiro entre 1 e 30" });
  });

  it("deve retornar 400 quando dias_aluguel não é inteiro", async () => {
    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    sql.mockResolvedValueOnce([{ id: "item-1", cacamba_id: "c1", quantidade: 1, dias_aluguel: 7, preco_diaria: 100 }]);

    const req = createReq({ dias_aluguel: 5.5 });
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O campo 'dias_aluguel' deve ser um inteiro entre 1 e 30" });
  });

  it("deve retornar 404 quando endereço não pertence ao consumidor", async () => {
    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    sql.mockResolvedValueOnce([{ id: "item-1", cacamba_id: "c1", quantidade: 1, dias_aluguel: 7, preco_diaria: 100 }]);
    sql.mockResolvedValueOnce([]); // endereço não encontrado

    const req = createReq();
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Endereço não encontrado" });
  });

  it("deve criar pedido com sucesso e retornar 201", async () => {
    const pedidoCriado = {
      id: "pedido-uuid-789",
      consumidor_id: "consumer-uuid-123",
      cacambeiro_id: "cacambeiro-1",
      endereco_id: "endereco-uuid-456",
      data_inicio: getFutureDate(5),
      dias_aluguel: 7,
      preco_final: 750,
      status_pagamento: "PENDENTE",
      status_aluguel: "AGUARDANDO_ENTREGA"
    };

    // carrinho
    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    // itens do carrinho
    sql.mockResolvedValueOnce([
      { id: "item-1", cacamba_id: "c1", quantidade: 2, dias_aluguel: 7, preco_diaria: 50 }
    ]);
    // endereço válido
    sql.mockResolvedValueOnce([{ id: "endereco-uuid-456" }]);
    // taxa_entrega
    sql.mockResolvedValueOnce([{ taxa_entrega: 50 }]);
    // insert aluguel
    sql.mockResolvedValueOnce([pedidoCriado]);
    // insert itens_aluguel
    sql.mockResolvedValueOnce([]);
    // delete itens_carrinho
    sql.mockResolvedValueOnce([]);
    // delete carrinho
    sql.mockResolvedValueOnce([]);

    const req = createReq();
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(pedidoCriado);
  });

  it("deve calcular preco_final corretamente com múltiplos itens", async () => {
    // 2 itens: (2 * 7 * 50) + (1 * 7 * 100) = 700 + 700 = 1400 + taxa 30 = 1430
    const pedidoCriado = {
      id: "pedido-uuid-789",
      preco_final: 1430,
      status_aluguel: "AGUARDANDO_ENTREGA",
      status_pagamento: "PENDENTE"
    };

    sql.mockResolvedValueOnce([{ id: "carrinho-1", cacambeiro_id: "cacambeiro-1" }]);
    sql.mockResolvedValueOnce([
      { id: "item-1", cacamba_id: "c1", quantidade: 2, dias_aluguel: 7, preco_diaria: 50 },
      { id: "item-2", cacamba_id: "c2", quantidade: 1, dias_aluguel: 7, preco_diaria: 100 }
    ]);
    sql.mockResolvedValueOnce([{ id: "endereco-uuid-456" }]);
    sql.mockResolvedValueOnce([{ taxa_entrega: 30 }]);
    sql.mockResolvedValueOnce([pedidoCriado]);
    sql.mockResolvedValueOnce([]); // insert item 1
    sql.mockResolvedValueOnce([]); // insert item 2
    sql.mockResolvedValueOnce([]); // delete itens_carrinho
    sql.mockResolvedValueOnce([]); // delete carrinho

    const req = createReq();
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(pedidoCriado);
  });

  it("deve retornar 500 em caso de erro interno", async () => {
    sql.mockRejectedValueOnce(new Error("DB error"));

    const req = createReq();
    const res = createRes();

    await alugueisController.checkout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Erro interno ao processar o pedido." });
  });
});
