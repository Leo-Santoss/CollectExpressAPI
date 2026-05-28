const alugueisController = require("../../src/controllers/alugueisController");

// Mock do módulo de banco de dados
jest.mock("../../src/config/db", () => {
  const mockSql = jest.fn();
  return mockSql;
});

const sql = require("../../src/config/db");

function createReq(queryOverrides = {}) {
  return {
    usuario_id: "consumer-uuid-123",
    tipo_perfil: "CONSUMIDOR",
    query: {
      page: "1",
      ...queryOverrides
    }
  };
}

function createRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("alugueisController.meusPedidos", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deve retornar pedidos paginados com formato correto", async () => {
    const pedidos = [
      {
        id: "pedido-1",
        consumidor_id: "consumer-uuid-123",
        cacambeiro_id: "cacambeiro-1",
        data_pedido: "2024-01-15T10:00:00Z",
        status_aluguel: "AGUARDANDO_ENTREGA",
        preco_final: 500,
        cacambeiro_nome: "João Silva"
      }
    ];

    sql.mockResolvedValueOnce([{ total: 1 }]); // COUNT query
    sql.mockResolvedValueOnce(pedidos); // SELECT query

    const req = createReq();
    const res = createRes();

    await alugueisController.meusPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: pedidos,
      total: 1,
      page: 1,
      totalPages: 1
    });
  });

  it("deve retornar lista vazia quando consumidor não tem pedidos", async () => {
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([]);

    const req = createReq();
    const res = createRes();

    await alugueisController.meusPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      total: 0,
      page: 1,
      totalPages: 0
    });
  });

  it("deve respeitar o parâmetro page para paginação", async () => {
    sql.mockResolvedValueOnce([{ total: 45 }]);
    sql.mockResolvedValueOnce([]);

    const req = createReq({ page: "2" });
    const res = createRes();

    await alugueisController.meusPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      total: 45,
      page: 2,
      totalPages: 3
    });
  });

  it("deve calcular totalPages corretamente com 20 itens por página", async () => {
    sql.mockResolvedValueOnce([{ total: 41 }]);
    sql.mockResolvedValueOnce([]);

    const req = createReq();
    const res = createRes();

    await alugueisController.meusPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      total: 41,
      page: 1,
      totalPages: 3
    });
  });

  it("deve tratar page inválido como página 1", async () => {
    sql.mockResolvedValueOnce([{ total: 5 }]);
    sql.mockResolvedValueOnce([]);

    const req = createReq({ page: "abc" });
    const res = createRes();

    await alugueisController.meusPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      total: 5,
      page: 1,
      totalPages: 1
    });
  });

  it("deve tratar page negativo como página 1", async () => {
    sql.mockResolvedValueOnce([{ total: 5 }]);
    sql.mockResolvedValueOnce([]);

    const req = createReq({ page: "-1" });
    const res = createRes();

    await alugueisController.meusPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      total: 5,
      page: 1,
      totalPages: 1
    });
  });

  it("deve incluir cacambeiro_nome nos resultados", async () => {
    const pedidos = [
      {
        id: "pedido-1",
        consumidor_id: "consumer-uuid-123",
        cacambeiro_id: "cacambeiro-1",
        data_pedido: "2024-01-15T10:00:00Z",
        status_aluguel: "EM_USO",
        status_pagamento: "PAGO",
        preco_final: 1200,
        cacambeiro_nome: "Maria Oliveira"
      },
      {
        id: "pedido-2",
        consumidor_id: "consumer-uuid-123",
        cacambeiro_id: "cacambeiro-2",
        data_pedido: "2024-01-10T08:00:00Z",
        status_aluguel: "FINALIZADO",
        status_pagamento: "PAGO",
        preco_final: 800,
        cacambeiro_nome: "Carlos Santos"
      }
    ];

    sql.mockResolvedValueOnce([{ total: 2 }]);
    sql.mockResolvedValueOnce(pedidos);

    const req = createReq();
    const res = createRes();

    await alugueisController.meusPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData.data[0]).toHaveProperty("cacambeiro_nome", "Maria Oliveira");
    expect(responseData.data[1]).toHaveProperty("cacambeiro_nome", "Carlos Santos");
  });

  it("deve retornar 500 em caso de erro interno", async () => {
    sql.mockRejectedValueOnce(new Error("DB error"));

    const req = createReq();
    const res = createRes();

    await alugueisController.meusPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Erro ao buscar pedidos." });
  });

  it("deve retornar totalPages=1 quando total é exatamente 20", async () => {
    sql.mockResolvedValueOnce([{ total: 20 }]);
    sql.mockResolvedValueOnce([]);

    const req = createReq();
    const res = createRes();

    await alugueisController.meusPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      total: 20,
      page: 1,
      totalPages: 1
    });
  });
});
