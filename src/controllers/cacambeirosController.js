const sql = require("../config/db");

const cacambeirosController = {
  // Dashboard do caçambeiro autenticado
  async dashboard(req, res) {
    try {
      const cacambeiroId = req.usuario_id;

      const [orderStats] = await sql`
        SELECT
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE status_aluguel IN ('AGUARDANDO_ENTREGA', 'EM_USO', 'AGUARDANDO_RETIRADA'))::int AS active_orders,
          COALESCE(SUM(preco_final) FILTER (WHERE status_pagamento = 'PAGO'), 0)::float AS total_revenue
        FROM alugueis
        WHERE cacambeiro_id = ${cacambeiroId}
      `;

      const [reviewStats] = await sql`
        SELECT ROUND(AVG(nota)::numeric, 1)::float AS nota_media
        FROM avaliacoes
        WHERE cacambeiro_id = ${cacambeiroId}
      `;

      return res.status(200).json({
        total_orders: orderStats.total_orders,
        active_orders: orderStats.active_orders,
        total_revenue: orderStats.total_revenue,
        nota_media: reviewStats.nota_media ?? null
      });
    } catch (error) {
      console.error("Erro ao buscar dashboard do caçambeiro:", error);
      return res.status(500).json({ error: "Erro interno ao buscar dados do dashboard." });
    }
  },

  // Financeiro do caçambeiro autenticado (pedidos finalizados e pagos)
  async financeiro(req, res) {
    try {
      const cacambeiroId = req.usuario_id;

      let dataInicio;
      let dataFim;

      if (req.query.mes && req.query.ano) {
        // Frontend sends mes (1-12) and ano
        const mes = parseInt(req.query.mes);
        const ano = parseInt(req.query.ano);
        dataInicio = new Date(ano, mes - 1, 1);
        dataFim = new Date(ano, mes, 0); // last day of month
      } else if (req.query.data_inicio && req.query.data_fim) {
        dataInicio = new Date(req.query.data_inicio);
        dataFim = new Date(req.query.data_fim);

        if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime())) {
          return res.status(400).json({
            error: "Datas inválidas.",
            fields: { data_inicio: "Formato esperado: YYYY-MM-DD", data_fim: "Formato esperado: YYYY-MM-DD" }
          });
        }

        // Validar intervalo máximo de 12 meses
        const diffMs = dataFim.getTime() - dataInicio.getTime();
        const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 365.25 / 12);
        if (diffMonths > 12) {
          return res.status(400).json({
            error: "O intervalo máximo permitido é de 12 meses.",
            fields: { data_inicio: "Intervalo excede 12 meses", data_fim: "Intervalo excede 12 meses" }
          });
        }
      } else {
        // Default: mês atual (primeiro dia até último dia)
        const now = new Date();
        dataInicio = new Date(now.getFullYear(), now.getMonth(), 1);
        dataFim = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }

      const dataInicioStr = dataInicio.toISOString().split("T")[0];
      const dataFimStr = dataFim.toISOString().split("T")[0];

      const orders = await sql`
        SELECT *
        FROM alugueis
        WHERE cacambeiro_id = ${cacambeiroId}
          AND status_aluguel = 'FINALIZADO'
          AND status_pagamento = 'PAGO'
          AND data_pedido >= ${dataInicioStr}::date
          AND data_pedido <= ${dataFimStr}::date
        ORDER BY data_pedido DESC
      `;

      const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.preco_final) || 0), 0);

      return res.status(200).json({
        resumo_mensal: {
          total: totalRevenue,
          quantidade: orders.length
        },
        pedidos: orders
      });
    } catch (error) {
      console.error("Erro ao buscar financeiro do caçambeiro:", error);
      return res.status(500).json({ error: "Erro interno ao buscar dados financeiros." });
    }
  },

  // Listar todos os caçambeiros e seus detalhes (Visão do Consumidor)
  async listar(req, res) {
    try {
      // Fazemos um JOIN entre a tabela base de usuários e a extensão de detalhes
      const cacambeiros = await sql`
        SELECT 
          u.id, u.nome_completo, u.email, u.telefone,
          d.horario_inicio, d.horario_fim, d.raio_entrega_km, d.nota_media, d.taxa_entrega
        FROM usuarios u
        INNER JOIN detalhes_cacambeiro d ON u.id = d.usuario_id
        WHERE u.tipo_perfil = 'CACAMBEIRO'
      `;

      return res.status(200).json(cacambeiros);
    } catch (error) {
      console.error("Erro ao listar caçambeiros:", error);
      return res.status(500).json({ error: "Erro interno ao buscar empresas." });
    }
  },

  // Ver perfil de um caçambeiro específico e suas caçambas disponíveis
  async buscarPorId(req, res) {
    try {
      const { id } = req.params;

      const cacambeiroInfo = await sql`
        SELECT 
          u.id, u.nome_completo, u.telefone,
          d.horario_inicio, d.horario_fim, d.raio_entrega_km, d.nota_media, d.taxa_entrega
        FROM usuarios u
        INNER JOIN detalhes_cacambeiro d ON u.id = d.usuario_id
        WHERE u.id = ${id} AND u.tipo_perfil = 'CACAMBEIRO'
      `;

      if (cacambeiroInfo.length === 0) {
        return res.status(404).json({ error: "Caçambeiro não encontrado." });
      }

      // Busca o catálogo daquele caçambeiro
      const cacambas = await sql`
        SELECT id, nome, tipo_residuo, tamanho_m3, preco_diaria, foto_url 
        FROM cacambas 
        WHERE cacambeiro_id = ${id} AND disponivel = true
      `;

      return res.status(200).json({
        perfil: cacambeiroInfo[0],
        catalogo: cacambas
      });

    } catch (error) {
      console.error("Erro ao buscar detalhes do caçambeiro:", error);
      return res.status(500).json({ error: "Erro interno ao buscar os detalhes da empresa." });
    }
  }
};

module.exports = cacambeirosController;