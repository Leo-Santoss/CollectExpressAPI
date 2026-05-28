const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Mock do módulo sql (database)
// Supports both tagged template literal calls (sql`...`) and regular function calls (sql(query, params)).
// Tagged template calls used for SQL fragment composition return a fragment marker.
// Awaited tagged template calls and regular function calls consume from the response queue.
jest.mock("../../src/config/db", () => {
  const responses = [];

  const mockSql = jest.fn((...args) => {
    // Regular function call: sql(queryString, paramsArray) — used by listarTodos
    if (typeof args[0] === "string") {
      const value = responses.shift() || [];
      return Promise.resolve(value);
    }
    // Tagged template call: sql`...`
    if (Array.isArray(args[0])) {
      const value = responses.shift() || [];
      // Return a thenable that also works as a SQL fragment for interpolation
      const result = Promise.resolve(value);
      result._isSqlFragment = true;
      return result;
    }
    return Promise.resolve([]);
  });

  mockSql.mockResolvedValueOnce = (value) => {
    responses.push(value);
    return mockSql;
  };

  mockSql._responses = responses;

  return mockSql;
});
const sql = require("../../src/config/db");

// Mock do JWT_SECRET para testes
process.env.JWT_SECRET = "test-secret-key";

const authController = require("../../src/controllers/authController");
const carrinhoController = require("../../src/controllers/carrinhoController");
const alugueisController = require("../../src/controllers/alugueisController");
const usuariosController = require("../../src/controllers/usuariosController");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createReq({ body = {}, params = {}, query = {}, usuario_id = null, ip = "127.0.0.1" } = {}) {
  return { body, params, query, usuario_id, ip, connection: { remoteAddress: ip } };
}

function createRes() {
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
  return res;
}

// ─── Flow 1: Registration → Login ───────────────────────────────────────────

describe("Integration: Registration → Login flow", () => {
  beforeEach(() => {
    sql.mockClear();
    sql._responses.length = 0;
  });

  it("should register a user and then login with the same credentials returning a JWT", async () => {
    const userData = {
      nome_completo: "Carlos Souza",
      email: "carlos@example.com",
      senha: "Senha123",
      tipo_perfil: "CONSUMIDOR",
      documento: "12345678901",
      telefone: "11999887766"
    };

    // ─── Step 1: Register ───
    const mockRegisteredUser = {
      id: "user-uuid-001",
      nome_completo: userData.nome_completo,
      email: userData.email,
      tipo_perfil: userData.tipo_perfil,
      documento: userData.documento,
      telefone: userData.telefone,
      criado_em: new Date().toISOString()
    };

    sql.mockResolvedValueOnce([mockRegisteredUser]);

    const registerReq = createReq({ body: userData });
    const registerRes = createRes();

    await authController.register(registerReq, registerRes);

    expect(registerRes.statusCode).toBe(201);
    expect(registerRes.jsonData.id).toBe("user-uuid-001");
    expect(registerRes.jsonData.email).toBe(userData.email);
    expect(registerRes.jsonData).not.toHaveProperty("senha_hash");

    // ─── Step 2: Login with same credentials ───
    // Simulate the stored hash that would exist in the database
    const storedHash = await bcrypt.hash(userData.senha, 10);

    const mockDbUser = {
      id: "user-uuid-001",
      nome_completo: userData.nome_completo,
      email: userData.email,
      senha_hash: storedHash,
      tipo_perfil: "CONSUMIDOR"
    };

    sql.mockResolvedValueOnce([mockDbUser]);

    const loginReq = createReq({ body: { email: userData.email, senha: userData.senha } });
    const loginRes = createRes();

    await authController.login(loginReq, loginRes);

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.jsonData).toHaveProperty("token");
    expect(loginRes.jsonData.usuario.id).toBe("user-uuid-001");
    expect(loginRes.jsonData.usuario.tipo_perfil).toBe("CONSUMIDOR");

    // Verify the token is a valid JWT
    const decoded = jwt.verify(loginRes.jsonData.token, process.env.JWT_SECRET);
    expect(decoded.id).toBe("user-uuid-001");
    expect(decoded.tipo_perfil).toBe("CONSUMIDOR");
  });

  it("should register a CACAMBEIRO with business details and login successfully", async () => {
    const cacambeiroData = {
      nome_completo: "Maria Transportes",
      email: "maria@transportes.com",
      senha: "Forte456",
      tipo_perfil: "CACAMBEIRO",
      documento: "12345678000199",
      telefone: "11988776655",
      horario_inicio: "07:00",
      horario_fim: "18:00",
      raio_entrega_km: 30,
      taxa_entrega: 120.0
    };

    const mockRegisteredUser = {
      id: "cacambeiro-uuid-001",
      nome_completo: cacambeiroData.nome_completo,
      email: cacambeiroData.email,
      tipo_perfil: "CACAMBEIRO",
      documento: cacambeiroData.documento,
      telefone: cacambeiroData.telefone,
      criado_em: new Date().toISOString()
    };

    // Register: INSERT usuarios + INSERT detalhes_cacambeiro
    sql.mockResolvedValueOnce([mockRegisteredUser]);
    sql.mockResolvedValueOnce([]);

    const registerReq = createReq({ body: cacambeiroData });
    const registerRes = createRes();

    await authController.register(registerReq, registerRes);

    expect(registerRes.statusCode).toBe(201);
    expect(registerRes.jsonData.tipo_perfil).toBe("CACAMBEIRO");
    expect(sql).toHaveBeenCalledTimes(2);

    // Login
    const storedHash = await bcrypt.hash(cacambeiroData.senha, 10);
    sql.mockResolvedValueOnce([{
      id: "cacambeiro-uuid-001",
      nome_completo: cacambeiroData.nome_completo,
      email: cacambeiroData.email,
      senha_hash: storedHash,
      tipo_perfil: "CACAMBEIRO"
    }]);

    const loginReq = createReq({ body: { email: cacambeiroData.email, senha: cacambeiroData.senha } });
    const loginRes = createRes();

    await authController.login(loginReq, loginRes);

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.jsonData.token).toBeDefined();
    expect(loginRes.jsonData.usuario.tipo_perfil).toBe("CACAMBEIRO");
  });

  it("should reject login with wrong password after successful registration", async () => {
    // Register
    sql.mockResolvedValueOnce([{
      id: "user-uuid-002",
      nome_completo: "Ana Lima",
      email: "ana@example.com",
      tipo_perfil: "CONSUMIDOR",
      documento: "98765432100",
      telefone: "11977665544",
      criado_em: new Date().toISOString()
    }]);

    const registerReq = createReq({
      body: {
        nome_completo: "Ana Lima",
        email: "ana@example.com",
        senha: "Correta123",
        tipo_perfil: "CONSUMIDOR",
        documento: "98765432100",
        telefone: "11977665544"
      }
    });
    const registerRes = createRes();
    await authController.register(registerReq, registerRes);
    expect(registerRes.statusCode).toBe(201);

    // Login with wrong password
    const storedHash = await bcrypt.hash("Correta123", 10);
    sql.mockResolvedValueOnce([{
      id: "user-uuid-002",
      email: "ana@example.com",
      senha_hash: storedHash,
      tipo_perfil: "CONSUMIDOR"
    }]);

    const loginReq = createReq({ body: { email: "ana@example.com", senha: "Errada999" } });
    const loginRes = createRes();

    await authController.login(loginReq, loginRes);

    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.jsonData.error).toBe("Credenciais inválidas");
  });
});

// ─── Flow 2: Cart → Checkout ─────────────────────────────────────────────────

describe("Integration: Cart → Checkout flow", () => {
  const consumidor_id = "consumer-uuid-001";
  const cacambeiro_id = "cacambeiro-uuid-001";
  const carrinho_id = "carrinho-uuid-001";
  const cacamba_id = "cacamba-uuid-001";

  beforeEach(() => {
    sql.mockClear();
    sql._responses.length = 0;
  });

  it("should add item to cart and then checkout creating an order", async () => {
    // ─── Step 1: Add item to cart ───
    // Mock: find cacamba
    sql.mockResolvedValueOnce([{ id: cacamba_id, cacambeiro_id }]);
    // Mock: check existing cart (none)
    sql.mockResolvedValueOnce([]);
    // Mock: create new cart
    sql.mockResolvedValueOnce([{ id: carrinho_id, cacambeiro_id }]);
    // Mock: insert item
    sql.mockResolvedValueOnce([]);
    // Mock: return cart items
    sql.mockResolvedValueOnce([{
      id: "item-uuid-001",
      cacamba_id,
      quantidade: 2,
      dias_aluguel: 7,
      nome: "Caçamba 5m³",
      tipo_residuo: "Entulho",
      preco_diaria: 50.0
    }]);

    const addReq = createReq({
      body: { cacamba_id, quantidade: 2, dias_aluguel: 7 },
      usuario_id: consumidor_id
    });
    const addRes = createRes();

    await carrinhoController.adicionarItem(addReq, addRes);

    expect(addRes.statusCode).toBe(201);
    expect(addRes.jsonData.id).toBe(carrinho_id);
    expect(addRes.jsonData.cacambeiro_id).toBe(cacambeiro_id);
    expect(addRes.jsonData.itens).toHaveLength(1);
    expect(addRes.jsonData.itens[0].quantidade).toBe(2);
    expect(addRes.jsonData.itens[0].dias_aluguel).toBe(7);

    // ─── Step 2: Checkout ───
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
    const data_inicio = tomorrow.toISOString().split("T")[0];

    // Mock: find cart
    sql.mockResolvedValueOnce([{ id: carrinho_id, cacambeiro_id }]);
    // Mock: find cart items
    sql.mockResolvedValueOnce([{
      id: "item-uuid-001",
      cacamba_id,
      quantidade: 2,
      dias_aluguel: 7,
      preco_diaria: 50.0
    }]);
    // Mock: validate endereco
    sql.mockResolvedValueOnce([{ id: "endereco-uuid-001" }]);
    // Mock: get taxa_entrega
    sql.mockResolvedValueOnce([{ taxa_entrega: 80.0 }]);
    // Mock: create aluguel (preco_final = 2 * 5 * 50 + 80 = 580)
    const mockOrder = {
      id: "aluguel-uuid-001",
      consumidor_id,
      cacambeiro_id,
      endereco_id: "endereco-uuid-001",
      data_pedido: new Date().toISOString(),
      data_inicio,
      dias_aluguel: 5,
      preco_final: 580.0,
      status_pagamento: "PENDENTE",
      status_aluguel: "AGUARDANDO_ENTREGA"
    };
    sql.mockResolvedValueOnce([mockOrder]);
    // Mock: insert itens_aluguel
    sql.mockResolvedValueOnce([]);
    // Mock: delete itens_carrinho
    sql.mockResolvedValueOnce([]);
    // Mock: delete carrinho
    sql.mockResolvedValueOnce([]);

    const checkoutReq = createReq({
      body: { endereco_id: "endereco-uuid-001", data_inicio, dias_aluguel: 5 },
      usuario_id: consumidor_id
    });
    const checkoutRes = createRes();

    await alugueisController.checkout(checkoutReq, checkoutRes);

    expect(checkoutRes.statusCode).toBe(201);
    expect(checkoutRes.jsonData.status_aluguel).toBe("AGUARDANDO_ENTREGA");
    expect(checkoutRes.jsonData.status_pagamento).toBe("PENDENTE");
    expect(checkoutRes.jsonData.consumidor_id).toBe(consumidor_id);
    expect(checkoutRes.jsonData.cacambeiro_id).toBe(cacambeiro_id);
  });

  it("should reject checkout when cart is empty", async () => {
    // Mock: no cart found
    sql.mockResolvedValueOnce([]);

    const checkoutReq = createReq({
      body: { endereco_id: "endereco-uuid-001", data_inicio: "2025-02-01", dias_aluguel: 5 },
      usuario_id: consumidor_id
    });
    const checkoutRes = createRes();

    await alugueisController.checkout(checkoutReq, checkoutRes);

    expect(checkoutRes.statusCode).toBe(400);
    expect(checkoutRes.jsonData.error).toBe("O carrinho está vazio");
  });

  it("should enforce single-cacambeiro constraint when adding items from different suppliers", async () => {
    const other_cacambeiro_id = "cacambeiro-uuid-999";

    // Mock: find cacamba (belongs to a different cacambeiro)
    sql.mockResolvedValueOnce([{ id: "cacamba-uuid-999", cacambeiro_id: other_cacambeiro_id }]);
    // Mock: existing cart belongs to a different cacambeiro
    sql.mockResolvedValueOnce([{ id: carrinho_id, cacambeiro_id }]);

    const addReq = createReq({
      body: { cacamba_id: "cacamba-uuid-999", quantidade: 1, dias_aluguel: 3 },
      usuario_id: consumidor_id
    });
    const addRes = createRes();

    await carrinhoController.adicionarItem(addReq, addRes);

    expect(addRes.statusCode).toBe(400);
    expect(addRes.jsonData.error).toContain("mesmo caçambeiro");
  });
});

// ─── Flow 3: Order Status Advancement ────────────────────────────────────────

describe("Integration: Order status advancement flow", () => {
  const cacambeiro_id = "cacambeiro-uuid-001";
  const order_id = "aluguel-uuid-001";

  beforeEach(() => {
    sql.mockClear();
    sql._responses.length = 0;
  });

  it("should advance order through all statuses sequentially: AGUARDANDO_ENTREGA → EM_USO → AGUARDANDO_RETIRADA → FINALIZADO", async () => {
    const transitions = [
      { from: "AGUARDANDO_ENTREGA", to: "EM_USO" },
      { from: "EM_USO", to: "AGUARDANDO_RETIRADA" },
      { from: "AGUARDANDO_RETIRADA", to: "FINALIZADO" }
    ];

    for (const transition of transitions) {
      // Mock: find order with current status
      sql.mockResolvedValueOnce([{
        id: order_id,
        cacambeiro_id,
        status_aluguel: transition.from
      }]);
      // Mock: update status
      sql.mockResolvedValueOnce([{
        id: order_id,
        cacambeiro_id,
        status_aluguel: transition.to
      }]);

      const req = createReq({
        params: { id: order_id },
        body: { status_aluguel: transition.to },
        usuario_id: cacambeiro_id
      });
      const res = createRes();

      await alugueisController.atualizarStatus(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.status_aluguel).toBe(transition.to);
    }
  });

  it("should reject backward transition from EM_USO to AGUARDANDO_ENTREGA", async () => {
    // Mock: find order with EM_USO status
    sql.mockResolvedValueOnce([{
      id: order_id,
      cacambeiro_id,
      status_aluguel: "EM_USO"
    }]);

    const req = createReq({
      params: { id: order_id },
      body: { status_aluguel: "AGUARDANDO_ENTREGA" },
      usuario_id: cacambeiro_id
    });
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain("Transição de status inválida");
  });

  it("should reject skipping a status (AGUARDANDO_ENTREGA → AGUARDANDO_RETIRADA)", async () => {
    sql.mockResolvedValueOnce([{
      id: order_id,
      cacambeiro_id,
      status_aluguel: "AGUARDANDO_ENTREGA"
    }]);

    const req = createReq({
      params: { id: order_id },
      body: { status_aluguel: "AGUARDANDO_RETIRADA" },
      usuario_id: cacambeiro_id
    });
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain("Transição de status inválida");
  });

  it("should reject any transition when order is already FINALIZADO", async () => {
    sql.mockResolvedValueOnce([{
      id: order_id,
      cacambeiro_id,
      status_aluguel: "FINALIZADO"
    }]);

    const req = createReq({
      params: { id: order_id },
      body: { status_aluguel: "EM_USO" },
      usuario_id: cacambeiro_id
    });
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain("já está finalizado");
  });

  it("should reject status update for order not belonging to the cacambeiro", async () => {
    // Mock: no order found (wrong cacambeiro)
    sql.mockResolvedValueOnce([]);

    const req = createReq({
      params: { id: order_id },
      body: { status_aluguel: "EM_USO" },
      usuario_id: "wrong-cacambeiro-id"
    });
    const res = createRes();

    await alugueisController.atualizarStatus(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.jsonData.error).toContain("não encontrado");
  });
});

// ─── Flow 4: Admin Search Flows ──────────────────────────────────────────────

describe("Integration: Admin user/order search and filter flows", () => {
  beforeEach(() => {
    sql.mockClear();
    sql._responses.length = 0;
  });

  describe("Admin user search", () => {
    it("should search users with text filter and return paginated results", async () => {
      const mockUsers = [
        {
          id: "user-001",
          nome_completo: "Carlos Silva",
          email: "carlos@example.com",
          tipo_perfil: "CONSUMIDOR",
          documento: "11111111111",
          telefone: "11999000001",
          criado_em: "2024-01-01T00:00:00.000Z"
        },
        {
          id: "user-002",
          nome_completo: "Carlos Oliveira",
          email: "carlos.o@example.com",
          tipo_perfil: "CACAMBEIRO",
          documento: "22222222222",
          telefone: "11999000002",
          criado_em: "2024-01-02T00:00:00.000Z"
        }
      ];

      // Fragment calls: sql`WHERE 1=1` + sql`${conditions} AND (nome_completo ILIKE ...)`
      sql.mockResolvedValueOnce([]);
      sql.mockResolvedValueOnce([]);
      // Actual query: count
      sql.mockResolvedValueOnce([{ total: 2 }]);
      // Actual query: data
      sql.mockResolvedValueOnce(mockUsers);

      const req = createReq({
        query: { page: "1", search: "Carlos" }
      });
      const res = createRes();

      await usuariosController.listarUsuarios(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.data).toHaveLength(2);
      expect(res.jsonData.total).toBe(2);
      expect(res.jsonData.page).toBe(1);
      expect(res.jsonData.totalPages).toBe(1);
      expect(res.jsonData.data[0].nome_completo).toBe("Carlos Silva");
    });

    it("should filter users by tipo_perfil", async () => {
      const mockCacambeiros = [
        {
          id: "user-003",
          nome_completo: "Maria Transportes",
          email: "maria@transportes.com",
          tipo_perfil: "CACAMBEIRO",
          documento: "33333333333",
          telefone: "11999000003",
          criado_em: "2024-01-03T00:00:00.000Z"
        }
      ];

      // Fragment calls: sql`WHERE 1=1` + sql`${conditions} AND tipo_perfil = ...`
      sql.mockResolvedValueOnce([]);
      sql.mockResolvedValueOnce([]);
      // Actual query: count
      sql.mockResolvedValueOnce([{ total: 1 }]);
      // Actual query: data
      sql.mockResolvedValueOnce(mockCacambeiros);

      const req = createReq({
        query: { page: "1", tipo_perfil: "CACAMBEIRO" }
      });
      const res = createRes();

      await usuariosController.listarUsuarios(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.data).toHaveLength(1);
      expect(res.jsonData.data[0].tipo_perfil).toBe("CACAMBEIRO");
      expect(res.jsonData.total).toBe(1);
    });

    it("should return empty results when search matches nothing", async () => {
      // Fragment calls: sql`WHERE 1=1` + sql`${conditions} AND (nome_completo ILIKE ...)`
      sql.mockResolvedValueOnce([]);
      sql.mockResolvedValueOnce([]);
      // Actual query: count
      sql.mockResolvedValueOnce([{ total: 0 }]);
      // Actual query: data
      sql.mockResolvedValueOnce([]);

      const req = createReq({
        query: { page: "1", search: "NinguemComEsseNome" }
      });
      const res = createRes();

      await usuariosController.listarUsuarios(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.data).toHaveLength(0);
      expect(res.jsonData.total).toBe(0);
      expect(res.jsonData.totalPages).toBe(0);
    });
  });

  describe("Admin order search", () => {
    it("should filter orders by status_aluguel", async () => {
      const mockOrders = [
        {
          id: "order-001",
          consumidor_id: "user-001",
          cacambeiro_id: "user-003",
          status_aluguel: "EM_USO",
          status_pagamento: "PAGO",
          preco_final: 500.0,
          consumidor_nome: "Carlos Silva",
          cacambeiro_nome: "Maria Transportes"
        }
      ];

      // Mock: count query
      sql.mockResolvedValueOnce([{ total: 1 }]);
      // Mock: data query
      sql.mockResolvedValueOnce(mockOrders);

      const req = createReq({
        query: { page: "1", status_aluguel: "EM_USO" }
      });
      const res = createRes();

      await alugueisController.listarTodos(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.data).toHaveLength(1);
      expect(res.jsonData.data[0].status_aluguel).toBe("EM_USO");
      expect(res.jsonData.total).toBe(1);
      expect(res.jsonData.page).toBe(1);
    });

    it("should filter orders by status_pagamento", async () => {
      const mockOrders = [
        {
          id: "order-002",
          consumidor_id: "user-001",
          cacambeiro_id: "user-003",
          status_aluguel: "FINALIZADO",
          status_pagamento: "PAGO",
          preco_final: 750.0,
          consumidor_nome: "Carlos Silva",
          cacambeiro_nome: "Maria Transportes"
        }
      ];

      // Mock: count query
      sql.mockResolvedValueOnce([{ total: 1 }]);
      // Mock: data query
      sql.mockResolvedValueOnce(mockOrders);

      const req = createReq({
        query: { page: "1", status_pagamento: "PAGO" }
      });
      const res = createRes();

      await alugueisController.listarTodos(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.data).toHaveLength(1);
      expect(res.jsonData.data[0].status_pagamento).toBe("PAGO");
    });

    it("should search orders by consumer/cacambeiro name", async () => {
      const mockOrders = [
        {
          id: "order-003",
          consumidor_id: "user-001",
          cacambeiro_id: "user-003",
          status_aluguel: "AGUARDANDO_ENTREGA",
          status_pagamento: "PENDENTE",
          preco_final: 300.0,
          consumidor_nome: "Carlos Silva",
          cacambeiro_nome: "Maria Transportes"
        }
      ];

      // Mock: count query
      sql.mockResolvedValueOnce([{ total: 1 }]);
      // Mock: data query
      sql.mockResolvedValueOnce(mockOrders);

      const req = createReq({
        query: { page: "1", search: "Carlos" }
      });
      const res = createRes();

      await alugueisController.listarTodos(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.data).toHaveLength(1);
      expect(res.jsonData.data[0].consumidor_nome).toBe("Carlos Silva");
    });

    it("should combine status filter and text search", async () => {
      // Mock: count query
      sql.mockResolvedValueOnce([{ total: 0 }]);
      // Mock: data query
      sql.mockResolvedValueOnce([]);

      const req = createReq({
        query: { page: "1", status_aluguel: "FINALIZADO", search: "Carlos" }
      });
      const res = createRes();

      await alugueisController.listarTodos(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.data).toHaveLength(0);
      expect(res.jsonData.total).toBe(0);
      // Verify sql was called with both filters (count + data = 2 calls)
      expect(sql).toHaveBeenCalledTimes(2);
    });

    it("should paginate order results correctly", async () => {
      const mockOrders = Array.from({ length: 20 }, (_, i) => ({
        id: `order-${String(i + 1).padStart(3, "0")}`,
        consumidor_id: "user-001",
        cacambeiro_id: "user-003",
        status_aluguel: "FINALIZADO",
        status_pagamento: "PAGO",
        preco_final: 100 + i * 10
      }));

      // Mock: count query (45 total orders)
      sql.mockResolvedValueOnce([{ total: 45 }]);
      // Mock: data query (page 1 = 20 items)
      sql.mockResolvedValueOnce(mockOrders);

      const req = createReq({
        query: { page: "1" }
      });
      const res = createRes();

      await alugueisController.listarTodos(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.data).toHaveLength(20);
      expect(res.jsonData.total).toBe(45);
      expect(res.jsonData.page).toBe(1);
      expect(res.jsonData.totalPages).toBe(3);
    });
  });
});
