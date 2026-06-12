const sql = require("../config/db");

const carrinhoController = {
  /**
   * GET /api/carrinho
   * Retorna o carrinho do consumidor com todos os itens e detalhes das caçambas.
   * Se não existir carrinho, retorna estrutura vazia.
   */
  async obter(req, res) {
    try {
      const consumidor_id = req.usuario_id;

      // Buscar carrinho do consumidor
      const carrinhoRows = await sql`
        SELECT id, consumidor_id, cacambeiro_id, criado_em
        FROM carrinho
        WHERE consumidor_id = ${consumidor_id}
      `;

      if (carrinhoRows.length === 0) {
        return res.status(200).json({
          id: null,
          consumidor_id,
          cacambeiro_id: null,
          itens: []
        });
      }

      const carrinho = carrinhoRows[0];

      // Buscar itens com detalhes da caçamba
      const itens = await sql`
        SELECT 
          ic.id,
          ic.cacamba_id,
          ic.quantidade,
          ic.dias_aluguel,
          c.nome,
          c.tipo_residuo,
          c.preco_diaria
        FROM itens_carrinho ic
        JOIN cacambas c ON c.id = ic.cacamba_id
        WHERE ic.carrinho_id = ${carrinho.id}
      `;

      return res.status(200).json({
        id: carrinho.id,
        consumidor_id: carrinho.consumidor_id,
        cacambeiro_id: carrinho.cacambeiro_id,
        itens: itens.map(item => ({
          id: item.id,
          cacamba_id: item.cacamba_id,
          quantidade: item.quantidade,
          dias_aluguel: item.dias_aluguel,
          cacamba: {
            id: item.cacamba_id,
            nome: item.nome,
            tipo_residuo: item.tipo_residuo,
            preco_diaria: item.preco_diaria
          }
        }))
      });
    } catch (error) {
      console.error("Erro ao buscar carrinho:", error);
      return res.status(500).json({ error: "Erro interno ao buscar o carrinho." });
    }
  },

  /**
   * POST /api/carrinho/itens
   * Adiciona item ao carrinho. Valida single-cacambeiro constraint.
   * Body: { cacamba_id, quantidade (1-10), dias_aluguel (1-90) }
   */
  async adicionarItem(req, res) {
    try {
      const consumidor_id = req.usuario_id;
      const { cacamba_id, quantidade, dias_aluguel } = req.body;

      // Validar campos obrigatórios
      if (!cacamba_id) {
        return res.status(400).json({ error: "O campo 'cacamba_id' é obrigatório." });
      }

      // Validar quantidade (1-10)
      if (quantidade === undefined || quantidade === null || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10) {
        return res.status(400).json({ error: "O campo 'quantidade' deve ser um inteiro entre 1 e 10." });
      }

      // Validar dias_aluguel (1-90)
      if (dias_aluguel === undefined || dias_aluguel === null || !Number.isInteger(dias_aluguel) || dias_aluguel < 1 || dias_aluguel > 90) {
        return res.status(400).json({ error: "O campo 'dias_aluguel' deve ser um inteiro entre 1 e 90." });
      }

      // Buscar a caçamba para obter o cacambeiro_id
      const cacambaRows = await sql`
        SELECT id, cacambeiro_id FROM cacambas WHERE id = ${cacamba_id}
      `;

      if (cacambaRows.length === 0) {
        return res.status(404).json({ error: "Caçamba não encontrada." });
      }

      const cacambeiro_id = cacambaRows[0].cacambeiro_id;

      // Verificar se já existe carrinho
      let carrinhoRows = await sql`
        SELECT id, cacambeiro_id FROM carrinho WHERE consumidor_id = ${consumidor_id}
      `;

      if (carrinhoRows.length > 0) {
        // Verificar single-cacambeiro constraint
        if (carrinhoRows[0].cacambeiro_id !== cacambeiro_id) {
          return res.status(400).json({
            error: "Todos os itens devem ser do mesmo caçambeiro. Limpe o carrinho para adicionar itens de outro fornecedor."
          });
        }
      } else {
        // Criar novo carrinho
        carrinhoRows = await sql`
          INSERT INTO carrinho (id, consumidor_id, cacambeiro_id)
          VALUES (gen_random_uuid(), ${consumidor_id}, ${cacambeiro_id})
          RETURNING id, cacambeiro_id
        `;
      }

      const carrinho_id = carrinhoRows[0].id;

      // Adicionar item ao carrinho
      await sql`
        INSERT INTO itens_carrinho (id, carrinho_id, cacamba_id, quantidade, dias_aluguel)
        VALUES (gen_random_uuid(), ${carrinho_id}, ${cacamba_id}, ${quantidade}, ${dias_aluguel})
      `;

      // Retornar carrinho atualizado
      const itens = await sql`
        SELECT 
          ic.id,
          ic.cacamba_id,
          ic.quantidade,
          ic.dias_aluguel,
          c.nome,
          c.tipo_residuo,
          c.preco_diaria
        FROM itens_carrinho ic
        JOIN cacambas c ON c.id = ic.cacamba_id
        WHERE ic.carrinho_id = ${carrinho_id}
      `;

      return res.status(201).json({
        id: carrinho_id,
        consumidor_id,
        cacambeiro_id,
        itens: itens.map(item => ({
          id: item.id,
          cacamba_id: item.cacamba_id,
          quantidade: item.quantidade,
          dias_aluguel: item.dias_aluguel,
          cacamba: {
            id: item.cacamba_id,
            nome: item.nome,
            tipo_residuo: item.tipo_residuo,
            preco_diaria: item.preco_diaria
          }
        }))
      });
    } catch (error) {
      console.error("Erro ao adicionar item ao carrinho:", error);
      return res.status(500).json({ error: "Erro interno ao adicionar item ao carrinho." });
    }
  },

  /**
   * PUT /api/carrinho/itens/:id
   * Atualiza a quantidade e/ou dias_aluguel de um item no carrinho.
   * Body: { quantidade (1-10), dias_aluguel (1-30) } - ambos opcionais
   */
  async atualizarItem(req, res) {
    try {
      const consumidor_id = req.usuario_id;
      const { id } = req.params;
      const { quantidade, dias_aluguel } = req.body;

      // Validar que ao menos um campo foi enviado
      if (quantidade === undefined && dias_aluguel === undefined) {
        return res.status(400).json({ error: "Informe 'quantidade' e/ou 'dias_aluguel' para atualizar." });
      }

      // Validar quantidade (1-10) se enviada
      if (quantidade !== undefined) {
        if (quantidade === null || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10) {
          return res.status(400).json({ error: "O campo 'quantidade' deve ser um inteiro entre 1 e 10." });
        }
      }

      // Validar dias_aluguel (1-30) se enviado
      if (dias_aluguel !== undefined) {
        if (dias_aluguel === null || !Number.isInteger(dias_aluguel) || dias_aluguel < 1 || dias_aluguel > 30) {
          return res.status(400).json({ error: "O campo 'dias_aluguel' deve ser um inteiro entre 1 e 30." });
        }
      }

      // Verificar se o item pertence ao carrinho do consumidor
      const itemRows = await sql`
        SELECT ic.id, ic.carrinho_id
        FROM itens_carrinho ic
        JOIN carrinho c ON c.id = ic.carrinho_id
        WHERE ic.id = ${id} AND c.consumidor_id = ${consumidor_id}
      `;

      if (itemRows.length === 0) {
        return res.status(404).json({ error: "Item não encontrado no carrinho." });
      }

      const carrinho_id = itemRows[0].carrinho_id;

      // Atualizar campos enviados
      if (quantidade !== undefined && dias_aluguel !== undefined) {
        await sql`
          UPDATE itens_carrinho SET quantidade = ${quantidade}, dias_aluguel = ${dias_aluguel} WHERE id = ${id}
        `;
      } else if (quantidade !== undefined) {
        await sql`
          UPDATE itens_carrinho SET quantidade = ${quantidade} WHERE id = ${id}
        `;
      } else {
        await sql`
          UPDATE itens_carrinho SET dias_aluguel = ${dias_aluguel} WHERE id = ${id}
        `;
      }

      // Buscar carrinho atualizado
      const carrinhoRows = await sql`
        SELECT id, consumidor_id, cacambeiro_id FROM carrinho WHERE id = ${carrinho_id}
      `;

      const itens = await sql`
        SELECT 
          ic.id,
          ic.cacamba_id,
          ic.quantidade,
          ic.dias_aluguel,
          c.nome,
          c.tipo_residuo,
          c.preco_diaria
        FROM itens_carrinho ic
        JOIN cacambas c ON c.id = ic.cacamba_id
        WHERE ic.carrinho_id = ${carrinho_id}
      `;

      return res.status(200).json({
        id: carrinhoRows[0].id,
        consumidor_id: carrinhoRows[0].consumidor_id,
        cacambeiro_id: carrinhoRows[0].cacambeiro_id,
        itens: itens.map(item => ({
          id: item.id,
          cacamba_id: item.cacamba_id,
          quantidade: item.quantidade,
          dias_aluguel: item.dias_aluguel,
          cacamba: {
            id: item.cacamba_id,
            nome: item.nome,
            tipo_residuo: item.tipo_residuo,
            preco_diaria: item.preco_diaria
          }
        }))
      });
    } catch (error) {
      console.error("Erro ao atualizar item do carrinho:", error);
      return res.status(500).json({ error: "Erro interno ao atualizar item do carrinho." });
    }
  },

  /**
   * DELETE /api/carrinho
   * Limpa o carrinho (remove todos os itens e o registro do carrinho).
   */
  async limpar(req, res) {
    try {
      const consumidor_id = req.usuario_id;

      // Buscar carrinho do consumidor
      const carrinhoRows = await sql`
        SELECT id FROM carrinho WHERE consumidor_id = ${consumidor_id}
      `;

      if (carrinhoRows.length === 0) {
        return res.status(200).json({ message: "Carrinho limpo com sucesso" });
      }

      const carrinho_id = carrinhoRows[0].id;

      // Deletar itens e carrinho
      await sql`DELETE FROM itens_carrinho WHERE carrinho_id = ${carrinho_id}`;
      await sql`DELETE FROM carrinho WHERE id = ${carrinho_id}`;

      return res.status(200).json({ message: "Carrinho limpo com sucesso" });
    } catch (error) {
      console.error("Erro ao limpar carrinho:", error);
      return res.status(500).json({ error: "Erro interno ao limpar o carrinho." });
    }
  },

  /**
   * DELETE /api/carrinho/itens/:id
   * Remove um item específico do carrinho.
   */
  async removerItem(req, res) {
    try {
      const consumidor_id = req.usuario_id;
      const { id } = req.params;

      // Verificar se o item pertence ao carrinho do consumidor
      const itemRows = await sql`
        SELECT ic.id, ic.carrinho_id
        FROM itens_carrinho ic
        JOIN carrinho c ON c.id = ic.carrinho_id
        WHERE ic.id = ${id} AND c.consumidor_id = ${consumidor_id}
      `;

      if (itemRows.length === 0) {
        return res.status(404).json({ error: "Item não encontrado no carrinho." });
      }

      const carrinho_id = itemRows[0].carrinho_id;

      // Deletar o item
      await sql`DELETE FROM itens_carrinho WHERE id = ${id}`;

      // Verificar quantos itens sobraram
      const itensRestantes = await sql`
        SELECT COUNT(*) as count FROM itens_carrinho WHERE carrinho_id = ${carrinho_id}
      `;

      if (parseInt(itensRestantes[0].count) === 0) {
        // Se foi o último item, deletar o carrinho
        await sql`DELETE FROM carrinho WHERE id = ${carrinho_id}`;
      }

      return res.status(200).json({ message: "Item removido com sucesso" });
    } catch (error) {
      console.error("Erro ao remover item do carrinho:", error);
      return res.status(500).json({ error: "Erro interno ao remover item do carrinho." });
    }
  }
};

module.exports = carrinhoController;
