const sql = require("../config/db");

const alugueisController = {
  /**
   * POST /api/alugueis/checkout
   * Finaliza o carrinho criando um pedido de aluguel.
   * Body: { endereco_id, data_inicio (YYYY-MM-DD), dias_aluguel (1-30) }
   */
  async checkout(req, res) {
    try {
      const consumidor_id = req.usuario_id;
      const { endereco_id, data_inicio, dias_aluguel } = req.body;

      // 1. Verificar se o carrinho existe e não está vazio
      const carrinhoRows = await sql`
        SELECT id, cacambeiro_id
        FROM carrinho
        WHERE consumidor_id = ${consumidor_id}
      `;

      if (carrinhoRows.length === 0) {
        return res.status(400).json({ error: "O carrinho está vazio" });
      }

      const carrinho_id = carrinhoRows[0].id;
      const cacambeiro_id = carrinhoRows[0].cacambeiro_id;

      // Verificar se há itens no carrinho
      const itensCarrinho = await sql`
        SELECT ic.id, ic.cacamba_id, ic.quantidade, ic.dias_aluguel,
               c.preco_diaria
        FROM itens_carrinho ic
        JOIN cacambas c ON c.id = ic.cacamba_id
        WHERE ic.carrinho_id = ${carrinho_id}
      `;

      if (itensCarrinho.length === 0) {
        return res.status(400).json({ error: "O carrinho está vazio" });
      }

      // 2. Validar campos obrigatórios
      if (!endereco_id) {
        return res.status(400).json({ error: "O campo 'endereco_id' é obrigatório" });
      }

      // Validar data_inicio (1-60 dias a partir de hoje)
      if (!data_inicio) {
        return res.status(400).json({ error: "O campo 'data_inicio' deve ser entre 1 e 60 dias a partir de hoje" });
      }

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const dataInicio = new Date(data_inicio + "T00:00:00");

      if (isNaN(dataInicio.getTime())) {
        return res.status(400).json({ error: "O campo 'data_inicio' deve ser entre 1 e 60 dias a partir de hoje" });
      }

      const diffTime = dataInicio.getTime() - hoje.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 1 || diffDays > 60) {
        return res.status(400).json({ error: "O campo 'data_inicio' deve ser entre 1 e 60 dias a partir de hoje" });
      }

      // Validar dias_aluguel (1-30)
      if (dias_aluguel === undefined || dias_aluguel === null || !Number.isInteger(dias_aluguel) || dias_aluguel < 1 || dias_aluguel > 30) {
        return res.status(400).json({ error: "O campo 'dias_aluguel' deve ser um inteiro entre 1 e 30" });
      }

      // 3. Validar que o endereço pertence ao consumidor
      const enderecoRows = await sql`
        SELECT id FROM enderecos
        WHERE id = ${endereco_id} AND usuario_id = ${consumidor_id}
      `;

      if (enderecoRows.length === 0) {
        return res.status(404).json({ error: "Endereço não encontrado" });
      }

      // 4. Buscar taxa_entrega do cacambeiro
      const detalhesRows = await sql`
        SELECT taxa_entrega FROM detalhes_cacambeiro
        WHERE usuario_id = ${cacambeiro_id}
      `;

      const taxa_entrega = detalhesRows.length > 0 ? Number(detalhesRows[0].taxa_entrega) : 0;

      // 5. Calcular preco_final: sum(quantidade × dias_aluguel × preco_diaria) + taxa_entrega
      let totalItens = 0;
      itensCarrinho.forEach(item => {
        totalItens += item.quantidade * dias_aluguel * Number(item.preco_diaria);
      });

      const preco_final = totalItens + taxa_entrega;

      // 6. Criar registro de aluguel
      const novoPedido = await sql`
        INSERT INTO alugueis (
          id, consumidor_id, cacambeiro_id, endereco_id, data_pedido, data_inicio,
          dias_aluguel, preco_final, status_pagamento, status_aluguel
        ) VALUES (
          gen_random_uuid(), ${consumidor_id}, ${cacambeiro_id}, ${endereco_id},
          NOW(), ${data_inicio}, ${dias_aluguel}, ${preco_final},
          'PENDENTE', 'AGUARDANDO_ENTREGA'
        )
        RETURNING *
      `;

      const aluguel_id = novoPedido[0].id;

      // 7. Criar itens_aluguel para cada item do carrinho
      for (const item of itensCarrinho) {
        await sql`
          INSERT INTO itens_aluguel (id, aluguel_id, cacamba_id, quantidade, dias_aluguel, preco_diaria)
          VALUES (gen_random_uuid(), ${aluguel_id}, ${item.cacamba_id}, ${item.quantidade}, ${dias_aluguel}, ${item.preco_diaria})
        `;
      }

      // 8. Limpar o carrinho
      await sql`DELETE FROM itens_carrinho WHERE carrinho_id = ${carrinho_id}`;
      await sql`DELETE FROM carrinho WHERE id = ${carrinho_id}`;

      // 9. Retornar o pedido criado
      return res.status(201).json(novoPedido[0]);

    } catch (error) {
      console.error("Erro no checkout:", error);
      return res.status(500).json({ error: "Erro interno ao processar o pedido." });
    }
  },

  /**
   * GET /api/alugueis/meus
   * Consumidor visualiza seu histórico de pedidos com paginação.
   * Query: page (default 1)
   * Returns: { data, total, page, totalPages }
   */
  async meusPedidos(req, res) {
    try {
      const consumidor_id = req.usuario_id;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = 20;
      const offset = (page - 1) * limit;

      // Count total orders for pagination
      const countResult = await sql`
        SELECT COUNT(*)::int AS total
        FROM alugueis
        WHERE consumidor_id = ${consumidor_id}
      `;
      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      // Fetch paginated orders with cacambeiro nome_completo
      const pedidos = await sql`
        SELECT a.*, u.nome_completo AS cacambeiro_nome
        FROM alugueis a
        JOIN usuarios u ON u.id = a.cacambeiro_id
        WHERE a.consumidor_id = ${consumidor_id}
        ORDER BY a.data_pedido DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return res.status(200).json({
        data: pedidos,
        total,
        page,
        totalPages
      });
    } catch (error) {
      return res.status(500).json({ error: "Erro ao buscar pedidos." });
    }
  },

  // Caçambeiro visualiza os pedidos que ele precisa entregar/recolher
  async gestaoPedidos(req, res) {
    try {
      const cacambeiro_id = req.usuario_id;
      const pedidos = await sql`
        SELECT a.*,
               u.nome_completo AS consumidor_nome,
               e.logradouro, e.numero, e.bairro, e.cidade_estado, e.cep
        FROM alugueis a
        JOIN usuarios u ON u.id = a.consumidor_id
        LEFT JOIN enderecos e ON e.id = a.endereco_id
        WHERE a.cacambeiro_id = ${cacambeiro_id}
        ORDER BY a.data_inicio ASC
      `;
      return res.status(200).json(pedidos);
    } catch (error) {
      return res.status(500).json({ error: "Erro ao buscar gestão de pedidos." });
    }
  },

  /**
   * GET /api/alugueis
   * Admin visualiza todos os pedidos com paginação, filtros e busca textual.
   * Query: page (default 1), status_aluguel, status_pagamento, search (min 1 char)
   * Returns: { data, total, page, totalPages }
   */
  async listarTodos(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = 20;
      const offset = (page - 1) * limit;
      const { status_aluguel, status_pagamento, search } = req.query;

      // Build WHERE conditions and params dynamically
      const conditions = [];
      const params = [];

      if (status_aluguel) {
        params.push(status_aluguel);
        conditions.push(`a.status_aluguel = $${params.length}`);
      }

      if (status_pagamento) {
        params.push(status_pagamento);
        conditions.push(`a.status_pagamento = $${params.length}`);
      }

      if (search && search.length >= 1) {
        const searchPattern = `%${search}%`;
        params.push(searchPattern);
        conditions.push(`(uc.nome_completo ILIKE $${params.length} OR uk.nome_completo ILIKE $${params.length})`);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      // Count total for pagination
      const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM alugueis a
        JOIN usuarios uc ON uc.id = a.consumidor_id
        JOIN usuarios uk ON uk.id = a.cacambeiro_id
        ${whereClause}
      `;
      const countResult = await sql.query(countQuery, params);
      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      // Fetch paginated orders with consumer/cacambeiro names and address
      const dataParams = [...params, limit, offset];
      const dataQuery = `
        SELECT a.*,
               uc.nome_completo AS consumidor_nome,
               uk.nome_completo AS cacambeiro_nome,
               e.logradouro, e.numero, e.bairro, e.cidade_estado, e.cep
        FROM alugueis a
        JOIN usuarios uc ON uc.id = a.consumidor_id
        JOIN usuarios uk ON uk.id = a.cacambeiro_id
        LEFT JOIN enderecos e ON e.id = a.endereco_id
        ${whereClause}
        ORDER BY a.data_pedido DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      const pedidos = await sql.query(dataQuery, dataParams);

      return res.status(200).json({
        data: pedidos,
        total,
        page,
        totalPages
      });
    } catch (error) {
      console.error("Erro ao listar todos os pedidos:", error);
      return res.status(500).json({ error: "Erro ao buscar pedidos." });
    }
  },

  // Caçambeiro atualiza o status de um pedido
  async atualizarStatus(req, res) {
    try {
      const cacambeiro_id = req.usuario_id;
      const { id } = req.params;
      const { status_aluguel } = req.body;

      // State machine: sequential forward-only transitions
      const STATUS_SEQUENCE = [
        'AGUARDANDO_ENTREGA',
        'EM_USO',
        'AGUARDANDO_RETIRADA',
        'FINALIZADO'
      ];

      // 1. Find the order and verify ownership
      const pedidoRows = await sql`
        SELECT * FROM alugueis
        WHERE id = ${id} AND cacambeiro_id = ${cacambeiro_id}
      `;

      if (pedidoRows.length === 0) {
        return res.status(404).json({ error: "Pedido não encontrado ou não pertence a você." });
      }

      const pedido = pedidoRows[0];

      // 2. Check if order is already FINALIZADO
      if (pedido.status_aluguel === 'FINALIZADO') {
        return res.status(400).json({ error: "O pedido já está finalizado" });
      }

      // 3. Validate the transition is the next sequential state
      const currentIndex = STATUS_SEQUENCE.indexOf(pedido.status_aluguel);
      const newIndex = STATUS_SEQUENCE.indexOf(status_aluguel);

      if (newIndex === -1 || newIndex !== currentIndex + 1) {
        return res.status(400).json({ error: "Transição de status inválida. Apenas transições sequenciais são permitidas." });
      }

      // 4. Update the status
      const resultado = await sql`
        UPDATE alugueis
        SET status_aluguel = ${status_aluguel}
        WHERE id = ${id} AND cacambeiro_id = ${cacambeiro_id}
        RETURNING *
      `;

      return res.status(200).json(resultado[0]);
    } catch (error) {
      return res.status(500).json({ error: "Erro ao atualizar status." });
    }
  }
};

module.exports = alugueisController;
