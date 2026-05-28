const alugueisController = require("../../src/controllers/alugueisController");

// Mock do módulo de banco de dados
jest.mock("../../src/config/db", () => {
  const mockSql = jest.fn();
  return mockSql;
});

const sql = require("../../src/config/db");

function createRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("alugueisController.listarTodos", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deve retornar pedidos paginados sem filtros (página 1, 20/page)", async () => {
    const pedidos = [
      {
        id: "pedido-1",
        consumidor_id: "consumer-1",
        cacambeiro_id: "cacambeiro-1",
        endereco_id: "end-1",
        data_pedido: "2025-01-15",
        status_aluguel: "EM_USO",
        status_pagamento: "PENDENTE",
        consumidor_nome: "João Silva",
        cacambeiro_nome: "Carlos Souza",
        logradouro: "Rua A",
        numero: "100",
        bairro: "Centro",
        cidade_estado: "SP",
        cep: "01001000"
      }
    ];

    // First call: count query
    sql.mockResolvedValueOnce([{ total: 1 }]);
    // Second call: data query
    sql.mockResolvedValueOnce(pedidos);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: {}
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: pedidos,
      total: 1,
      page: 1,
      totalPages: 1
    });
  });

  it("deve aplicar paginação corretamente (página 2)", async () => {
    sql.mockResolvedValueOnce([{ total: 25 }]);
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: { page: "2" }
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      total: 25,
      page: 2,
      totalPages: 2
    });

    // Verify LIMIT and OFFSET params in data query
    const dataCallParams = sql.mock.calls[1][1];
    expect(dataCallParams).toContain(20); // limit
    expect(dataCallParams).toContain(20); // offset for page 2
  });

  it("deve filtrar por status_aluguel", async () => {
    sql.mockResolvedValueOnce([{ total: 3 }]);
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: { status_aluguel: "EM_USO" }
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // Verify the count query includes WHERE clause with status_aluguel
    const countQuery = sql.mock.calls[0][0];
    expect(countQuery).toContain("a.status_aluguel = $1");
    expect(sql.mock.calls[0][1]).toContain("EM_USO");
  });

  it("deve filtrar por status_pagamento", async () => {
    sql.mockResolvedValueOnce([{ total: 2 }]);
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: { status_pagamento: "PENDENTE" }
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    const countQuery = sql.mock.calls[0][0];
    expect(countQuery).toContain("a.status_pagamento = $1");
    expect(sql.mock.calls[0][1]).toContain("PENDENTE");
  });

  it("deve aplicar busca textual por nome (search)", async () => {
    sql.mockResolvedValueOnce([{ total: 1 }]);
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: { search: "João" }
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    const countQuery = sql.mock.calls[0][0];
    expect(countQuery).toContain("uc.nome_completo ILIKE");
    expect(countQuery).toContain("uk.nome_completo ILIKE");
    expect(sql.mock.calls[0][1]).toContain("%João%");
  });

  it("deve combinar múltiplos filtros (status_aluguel + status_pagamento + search)", async () => {
    sql.mockResolvedValueOnce([{ total: 1 }]);
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: {
        status_aluguel: "AGUARDANDO_ENTREGA",
        status_pagamento: "PENDENTE",
        search: "Maria"
      }
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    const countQuery = sql.mock.calls[0][0];
    expect(countQuery).toContain("a.status_aluguel = $1");
    expect(countQuery).toContain("a.status_pagamento = $2");
    expect(countQuery).toContain("ILIKE $3");

    const countParams = sql.mock.calls[0][1];
    expect(countParams).toEqual(["AGUARDANDO_ENTREGA", "PENDENTE", "%Maria%"]);
  });

  it("deve usar page default 1 quando page é inválido", async () => {
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: { page: "abc" }
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      total: 0,
      page: 1,
      totalPages: 0
    });
  });

  it("deve usar page 1 quando page é negativo", async () => {
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: { page: "-5" }
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      total: 0,
      page: 1,
      totalPages: 0
    });
  });

  it("deve ordenar por data_pedido DESC", async () => {
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: {}
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    const dataQuery = sql.mock.calls[1][0];
    expect(dataQuery).toContain("ORDER BY a.data_pedido DESC");
  });

  it("deve incluir consumidor_nome, cacambeiro_nome e dados de endereço", async () => {
    sql.mockResolvedValueOnce([{ total: 0 }]);
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: {}
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    const dataQuery = sql.mock.calls[1][0];
    expect(dataQuery).toContain("uc.nome_completo AS consumidor_nome");
    expect(dataQuery).toContain("uk.nome_completo AS cacambeiro_nome");
    expect(dataQuery).toContain("e.logradouro");
    expect(dataQuery).toContain("e.numero");
    expect(dataQuery).toContain("e.bairro");
    expect(dataQuery).toContain("e.cidade_estado");
    expect(dataQuery).toContain("e.cep");
  });

  it("deve retornar 500 em caso de erro interno", async () => {
    sql.mockRejectedValueOnce(new Error("DB error"));

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: {}
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Erro ao buscar pedidos." });
  });

  it("deve calcular totalPages corretamente", async () => {
    sql.mockResolvedValueOnce([{ total: 41 }]);
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "admin-1",
      tipo_perfil: "ADMIN",
      query: {}
    };
    const res = createRes();

    await alugueisController.listarTodos(req, res);

    expect(res.json).toHaveBeenCalledWith({
      data: [],
      total: 41,
      page: 1,
      totalPages: 3 // ceil(41/20) = 3
    });
  });
});
