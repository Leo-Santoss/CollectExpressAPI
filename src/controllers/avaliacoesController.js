const sql = require("../config/db");

const avaliacoesController = {
  /**
   * POST /api/avaliacoes
   * Consumidor submete uma avaliação para um pedido finalizado.
   * Body: { aluguel_id, nota (1-5), comentario (optional, max 500 chars) }
   */
  async criar(req, res) {
    try {
      const consumidor_id = req.usuario_id;
      const { aluguel_id, nota, comentario } = req.body;

      // 1. Validar campos obrigatórios
      if (!aluguel_id) {
        return res.status(400).json({ error: "O campo 'aluguel_id' é obrigatório" });
      }

      if (nota === undefined || nota === null) {
        return res.status(400).json({ error: "O campo 'nota' é obrigatório" });
      }

      // 2. Validar nota: inteiro entre 1 e 5
      if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
        return res.status(400).json({ error: "O campo 'nota' deve ser um inteiro entre 1 e 5" });
      }

      // 3. Validar comentario: opcional, max 500 chars
      if (comentario !== undefined && comentario !== null && comentario.length > 500) {
        return res.status(400).json({ error: "O campo 'comentario' deve ter no máximo 500 caracteres" });
      }

      // 4. Verificar se o pedido existe e pertence ao consumidor
      const pedido = await sql`
        SELECT id, consumidor_id, cacambeiro_id, status_aluguel
        FROM alugueis
        WHERE id = ${aluguel_id} AND consumidor_id = ${consumidor_id}
      `;

      if (pedido.length === 0) {
        return res.status(404).json({ error: "Pedido não encontrado" });
      }

      // 5. Verificar se o pedido está FINALIZADO
      if (pedido[0].status_aluguel !== "FINALIZADO") {
        return res.status(400).json({ error: "Apenas pedidos finalizados podem ser avaliados" });
      }

      // 6. Verificar se já existe avaliação para este pedido
      const avaliacaoExistente = await sql`
        SELECT id FROM avaliacoes WHERE aluguel_id = ${aluguel_id}
      `;

      if (avaliacaoExistente.length > 0) {
        return res.status(400).json({ error: "Este pedido já foi avaliado" });
      }

      // 7. Criar a avaliação
      const cacambeiro_id = pedido[0].cacambeiro_id;

      const novaAvaliacao = await sql`
        INSERT INTO avaliacoes (id, aluguel_id, consumidor_id, cacambeiro_id, nota, comentario, data_avaliacao)
        VALUES (gen_random_uuid(), ${aluguel_id}, ${consumidor_id}, ${cacambeiro_id}, ${nota}, ${comentario || null}, NOW())
        RETURNING *
      `;

      return res.status(201).json(novaAvaliacao[0]);
    } catch (error) {
      return res.status(500).json({ error: "Erro interno ao salvar avaliação" });
    }
  },

  /**
   * GET /api/avaliacoes/cacambeiro/:id
   * Lista todas as avaliações de um caçambeiro específico.
   * Inclui nome_completo do avaliador, ordenado por data_avaliacao DESC.
   */
  async listarPorCacambeiro(req, res) {
    try {
      const { id } = req.params;

      const avaliacoes = await sql`
        SELECT av.id, av.aluguel_id, av.consumidor_id, av.cacambeiro_id,
               av.nota, av.comentario, av.data_avaliacao,
               u.nome_completo AS consumidor_nome
        FROM avaliacoes av
        JOIN usuarios u ON av.consumidor_id = u.id
        WHERE av.cacambeiro_id = ${id}
        ORDER BY av.data_avaliacao DESC
      `;

      return res.status(200).json(avaliacoes);
    } catch (error) {
      return res.status(500).json({ error: "Erro ao buscar avaliações" });
    }
  },
};

module.exports = avaliacoesController;
