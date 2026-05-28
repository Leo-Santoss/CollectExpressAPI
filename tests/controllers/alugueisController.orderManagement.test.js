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

describe("alugueisController.gestaoPedidos", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deve retornar pedidos do cacambeiro com dados do consumidor e endereço, ordenados por data_inicio ASC", async () => {
    const pedidos = [
      {
        id: "pedido-1",
        cacambeiro_id: "cacambeiro-123",
        consumidor_id: "consumer-1",
        data_inicio: "2025-01-10",
        status_aluguel: "AGUARDANDO_ENTREGA",
        consumidor_nome: "João Silva",
        logradouro: "Rua A",
        numero: "100",
        bairro: "Centro",
        cidade_estado: "SP",
        cep: "01001000"
      },
      {
        id: "pedido-2",
        cacambeiro_id: "cacambeiro-123",
        consumidor_id: "consumer-2",
        data_inicio: "2025-01-15",
        status_aluguel: "EM_USO",
        consumidor_nome: "Maria Souza",
        logradouro: "Rua B",
        numero: "200",
        bairro: "Jardim",
        cidade_estado: "RJ",
        cep: "20000000"
      }
    ];

    sql.mockResolvedValueOnce(pedidos);

    const req = { usuario_id: "cacambeiro-123", tipo_perfil: "CACAMBEIRO" };
    const res = createRes();

    await alugueisController.gestaoPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(pedidos);
  });

  it("deve retornar array vazio quando cacambeiro não tem pedidos", async () => {
    sql.mockResolvedValueOnce([]);

    const req = { usuario_id: "cacambeiro-123", tipo_perfil: "CACAMBEIRO" };
    const res = createRes();

    await alugueisController.gestaoPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("deve retornar 500 em caso de erro interno", async () => {
    sql.mockRejectedValueOnce(new Error("DB error"));

    const req = { usuario_id: "cacambeiro-123", tipo_perfil: "CACAMBEIRO" };
    const res = createRes();

    await alugueisController.gestaoPedidos(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Erro ao buscar gestão de pedidos." });
  });
});

describe("alugueisController.atualizarStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deve retornar 404 quando pedido não existe ou não pertence ao cacambeiro", async () => {
    sql.mockResolvedValueOnce([]);

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-inexistente" },
      body: { status_aluguel: "EM_USO" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Pedido não encontrado ou não pertence a você." });
  });

  it("deve retornar 400 quando pedido já está FINALIZADO", async () => {
    sql.mockResolvedValueOnce([{ id: "pedido-1", status_aluguel: "FINALIZADO", cacambeiro_id: "cacambeiro-123" }]);

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-1" },
      body: { status_aluguel: "EM_USO" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O pedido já está finalizado" });
  });

  it("deve retornar 400 para transição para trás (EM_USO → AGUARDANDO_ENTREGA)", async () => {
    sql.mockResolvedValueOnce([{ id: "pedido-1", status_aluguel: "EM_USO", cacambeiro_id: "cacambeiro-123" }]);

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-1" },
      body: { status_aluguel: "AGUARDANDO_ENTREGA" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Transição de status inválida. Apenas transições sequenciais são permitidas." });
  });

  it("deve retornar 400 para pular etapa (AGUARDANDO_ENTREGA → AGUARDANDO_RETIRADA)", async () => {
    sql.mockResolvedValueOnce([{ id: "pedido-1", status_aluguel: "AGUARDANDO_ENTREGA", cacambeiro_id: "cacambeiro-123" }]);

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-1" },
      body: { status_aluguel: "AGUARDANDO_RETIRADA" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Transição de status inválida. Apenas transições sequenciais são permitidas." });
  });

  it("deve retornar 400 para pular etapa (AGUARDANDO_ENTREGA → FINALIZADO)", async () => {
    sql.mockResolvedValueOnce([{ id: "pedido-1", status_aluguel: "AGUARDANDO_ENTREGA", cacambeiro_id: "cacambeiro-123" }]);

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-1" },
      body: { status_aluguel: "FINALIZADO" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Transição de status inválida. Apenas transições sequenciais são permitidas." });
  });

  it("deve retornar 400 para status inválido/desconhecido", async () => {
    sql.mockResolvedValueOnce([{ id: "pedido-1", status_aluguel: "AGUARDANDO_ENTREGA", cacambeiro_id: "cacambeiro-123" }]);

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-1" },
      body: { status_aluguel: "STATUS_INVALIDO" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Transição de status inválida. Apenas transições sequenciais são permitidas." });
  });

  it("deve avançar AGUARDANDO_ENTREGA → EM_USO com sucesso", async () => {
    const pedidoAtualizado = { id: "pedido-1", status_aluguel: "EM_USO", cacambeiro_id: "cacambeiro-123" };

    sql.mockResolvedValueOnce([{ id: "pedido-1", status_aluguel: "AGUARDANDO_ENTREGA", cacambeiro_id: "cacambeiro-123" }]);
    sql.mockResolvedValueOnce([pedidoAtualizado]);

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-1" },
      body: { status_aluguel: "EM_USO" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(pedidoAtualizado);
  });

  it("deve avançar EM_USO → AGUARDANDO_RETIRADA com sucesso", async () => {
    const pedidoAtualizado = { id: "pedido-1", status_aluguel: "AGUARDANDO_RETIRADA", cacambeiro_id: "cacambeiro-123" };

    sql.mockResolvedValueOnce([{ id: "pedido-1", status_aluguel: "EM_USO", cacambeiro_id: "cacambeiro-123" }]);
    sql.mockResolvedValueOnce([pedidoAtualizado]);

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-1" },
      body: { status_aluguel: "AGUARDANDO_RETIRADA" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(pedidoAtualizado);
  });

  it("deve avançar AGUARDANDO_RETIRADA → FINALIZADO com sucesso", async () => {
    const pedidoAtualizado = { id: "pedido-1", status_aluguel: "FINALIZADO", cacambeiro_id: "cacambeiro-123" };

    sql.mockResolvedValueOnce([{ id: "pedido-1", status_aluguel: "AGUARDANDO_RETIRADA", cacambeiro_id: "cacambeiro-123" }]);
    sql.mockResolvedValueOnce([pedidoAtualizado]);

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-1" },
      body: { status_aluguel: "FINALIZADO" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(pedidoAtualizado);
  });

  it("deve retornar 400 para transição para o mesmo status (EM_USO → EM_USO)", async () => {
    sql.mockResolvedValueOnce([{ id: "pedido-1", status_aluguel: "EM_USO", cacambeiro_id: "cacambeiro-123" }]);

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-1" },
      body: { status_aluguel: "EM_USO" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Transição de status inválida. Apenas transições sequenciais são permitidas." });
  });

  it("deve retornar 500 em caso de erro interno", async () => {
    sql.mockRejectedValueOnce(new Error("DB error"));

    const req = {
      usuario_id: "cacambeiro-123",
      params: { id: "pedido-1" },
      body: { status_aluguel: "EM_USO" }
    };
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Erro ao atualizar status." });
  });
});
