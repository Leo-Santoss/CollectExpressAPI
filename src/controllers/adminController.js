const sql = require("../config/db");

const adminController = {
  // ============================================
  // CATEGORIAS CRUD
  // ============================================

  /**
   * GET /api/admin/categorias
   * Lista todas as categorias com contagem de caçambas associadas.
   * Retorna array de { id, nome, criado_em, cacambas_count } ordenado por nome ASC.
   */
  async listarCategorias(req, res) {
    try {
      const categorias = await sql`
        SELECT 
          c.id,
          c.nome,
          c.criado_em,
          COUNT(ca.id)::int AS cacambas_count
        FROM categorias c
        LEFT JOIN cacambas ca ON LOWER(ca.tipo_residuo) = LOWER(c.nome)
        GROUP BY c.id, c.nome, c.criado_em
        ORDER BY c.nome ASC
      `;

      return res.status(200).json(categorias);
    } catch (error) {
      console.error("Erro ao listar categorias:", error);
      return res.status(500).json({ error: "Erro interno ao listar categorias." });
    }
  },

  /**
   * POST /api/admin/categorias
   * Cria uma nova categoria.
   * Body: { nome }
   * Validações: não vazio, não apenas espaços, máximo 100 caracteres, único (case-insensitive).
   */
  async criarCategoria(req, res) {
    try {
      const { nome } = req.body;

      // Validação: campo obrigatório e não vazio
      if (!nome || typeof nome !== "string" || nome.trim().length === 0) {
        return res.status(400).json({ error: "O nome da categoria é obrigatório e não pode ser vazio." });
      }

      const nomeTrimmed = nome.trim();

      // Validação: máximo 100 caracteres
      if (nomeTrimmed.length > 100) {
        return res.status(400).json({ error: "O nome da categoria deve ter no máximo 100 caracteres." });
      }

      // Validação: unicidade case-insensitive
      const existente = await sql`
        SELECT id FROM categorias WHERE LOWER(nome) = LOWER(${nomeTrimmed})
      `;

      if (existente.length > 0) {
        return res.status(409).json({ error: "Já existe uma categoria com este nome." });
      }

      const resultado = await sql`
        INSERT INTO categorias (nome)
        VALUES (${nomeTrimmed})
        RETURNING id, nome, criado_em
      `;

      return res.status(201).json(resultado[0]);
    } catch (error) {
      console.error("Erro ao criar categoria:", error);
      return res.status(500).json({ error: "Erro interno ao criar categoria." });
    }
  },

  /**
   * PUT /api/admin/categorias/:id
   * Atualiza uma categoria existente.
   * Body: { nome }
   * Mesmas validações do POST.
   */
  async atualizarCategoria(req, res) {
    try {
      const { id } = req.params;
      const { nome } = req.body;

      // Validação: campo obrigatório e não vazio
      if (!nome || typeof nome !== "string" || nome.trim().length === 0) {
        return res.status(400).json({ error: "O nome da categoria é obrigatório e não pode ser vazio." });
      }

      const nomeTrimmed = nome.trim();

      // Validação: máximo 100 caracteres
      if (nomeTrimmed.length > 100) {
        return res.status(400).json({ error: "O nome da categoria deve ter no máximo 100 caracteres." });
      }

      // Verificar se a categoria existe
      const categoriaExistente = await sql`
        SELECT id FROM categorias WHERE id = ${id}
      `;

      if (categoriaExistente.length === 0) {
        return res.status(404).json({ error: "Categoria não encontrada." });
      }

      // Validação: unicidade case-insensitive (excluindo a própria categoria)
      const duplicada = await sql`
        SELECT id FROM categorias WHERE LOWER(nome) = LOWER(${nomeTrimmed}) AND id != ${id}
      `;

      if (duplicada.length > 0) {
        return res.status(409).json({ error: "Já existe uma categoria com este nome." });
      }

      const resultado = await sql`
        UPDATE categorias
        SET nome = ${nomeTrimmed}
        WHERE id = ${id}
        RETURNING id, nome, criado_em
      `;

      return res.status(200).json(resultado[0]);
    } catch (error) {
      console.error("Erro ao atualizar categoria:", error);
      return res.status(500).json({ error: "Erro interno ao atualizar categoria." });
    }
  },

  /**
   * DELETE /api/admin/categorias/:id
   * Remove uma categoria.
   * Impede remoção se houver caçambas associadas (via tipo_residuo).
   */
  async removerCategoria(req, res) {
    try {
      const { id } = req.params;

      // Verificar se a categoria existe
      const categoriaExistente = await sql`
        SELECT id, nome FROM categorias WHERE id = ${id}
      `;

      if (categoriaExistente.length === 0) {
        return res.status(404).json({ error: "Categoria não encontrada." });
      }

      const nomeCategoria = categoriaExistente[0].nome;

      // Verificar se há caçambas associadas
      const cacambasAssociadas = await sql`
        SELECT COUNT(*)::int AS total FROM cacambas WHERE LOWER(tipo_residuo) = LOWER(${nomeCategoria})
      `;

      const total = cacambasAssociadas[0].total;

      if (total > 0) {
        return res.status(400).json({
          error: `Não é possível remover esta categoria. Existem ${total} caçamba(s) associada(s).`
        });
      }

      await sql`
        DELETE FROM categorias WHERE id = ${id}
      `;

      return res.status(200).json({ message: "Categoria removida com sucesso." });
    } catch (error) {
      console.error("Erro ao remover categoria:", error);
      return res.status(500).json({ error: "Erro interno ao remover categoria." });
    }
  },

  // ============================================
  // DASHBOARD
  // ============================================

  /**
   * GET /api/admin/dashboard
   * Retorna métricas gerais do sistema para o painel administrativo.
   * Query: granularity ('daily' | 'weekly', default 'daily')
   */
  async dashboard(req, res) {
    try {
      const granularity = req.query.granularity || "daily";

      // 1. Total de usuários
      const totalUsersResult = await sql`
        SELECT COUNT(*)::int AS total FROM usuarios
      `;
      const total_users = totalUsersResult[0].total;

      // 2. Total de pedidos (alugueis)
      const totalOrdersResult = await sql`
        SELECT COUNT(*)::int AS total FROM alugueis
      `;
      const total_orders = totalOrdersResult[0].total;

      // 3. Receita total (soma de preco_final onde status_pagamento = 'PAGO')
      const totalRevenueResult = await sql`
        SELECT COALESCE(SUM(preco_final), 0)::numeric AS total
        FROM alugueis
        WHERE status_pagamento = 'PAGO'
      `;
      const total_revenue = Number(totalRevenueResult[0].total);
      
      // 3.1 Lucro da Plataforma (5% do total movimentado)
      const lucro_plataforma = total_revenue * 0.05;

      // 4. Caçambeiros ativos (com pelo menos uma caçamba disponível)
      const activeCacambeirosResult = await sql`
        SELECT COUNT(DISTINCT u.id)::int AS total
        FROM usuarios u
        JOIN cacambas c ON c.cacambeiro_id = u.id
        WHERE u.tipo_perfil = 'CACAMBEIRO'
          AND c.disponivel = TRUE
      `;
      const active_cacambeiros = activeCacambeirosResult[0].total;

      // 5. Pedidos por status
      const ordersByStatusResult = await sql`
        SELECT status_aluguel, COUNT(*)::int AS count
        FROM alugueis
        GROUP BY status_aluguel
      `;
      const orders_by_status = {};
      ordersByStatusResult.forEach(row => {
        orders_by_status[row.status_aluguel] = row.count;
      });

      // 6. Pedidos ao longo do tempo (últimos 30 dias)
      let orders_over_time;

      if (granularity === "weekly") {
        const weeklyResult = await sql`
          SELECT DATE_TRUNC('week', data_pedido)::date AS date,
                 COUNT(*)::int AS count
          FROM alugueis
          WHERE data_pedido >= NOW() - INTERVAL '30 days'
          GROUP BY DATE_TRUNC('week', data_pedido)
          ORDER BY date ASC
        `;
        orders_over_time = weeklyResult.map(row => ({
          date: row.date.toISOString().split("T")[0],
          count: row.count
        }));
      } else {
        const dailyResult = await sql`
          SELECT data_pedido::date AS date,
                 COUNT(*)::int AS count
          FROM alugueis
          WHERE data_pedido >= NOW() - INTERVAL '30 days'
          GROUP BY data_pedido::date
          ORDER BY date ASC
        `;
        orders_over_time = dailyResult.map(row => ({
          date: row.date.toISOString().split("T")[0],
          count: row.count
        }));
      }

      return res.status(200).json({
        total_usuarios: total_users,
        total_pedidos: total_orders,
        receita_total: total_revenue,
        lucro_plataforma,
        cacambeiros_ativos: active_cacambeiros,
        pedidos_por_status: orders_by_status,
        pedidos_ao_longo_do_tempo: orders_over_time
      });
    } catch (error) {
      console.error("Erro no dashboard admin:", error);
      return res.status(500).json({ error: "Erro interno ao buscar dados do dashboard." });
    }
  }
};

module.exports = adminController;
