const sql = require("../config/db");

const enderecosController = {
  /**
   * GET /api/enderecos
   * Lista todos os endereços do usuário autenticado.
   * Ownership isolation: usa req.usuario_id do token JWT.
   */
  async listar(req, res) {
    try {
      const usuario_id = req.usuario_id;

      const enderecos = await sql`
        SELECT id, cep, logradouro, numero, bairro, cidade_estado, criado_em
        FROM enderecos
        WHERE usuario_id = ${usuario_id}
        ORDER BY criado_em DESC
      `;

      return res.status(200).json(enderecos);
    } catch (error) {
      console.error("Erro ao listar endereços:", error);
      return res.status(500).json({ error: "Erro interno ao buscar endereços." });
    }
  },

  /**
   * POST /api/enderecos
   * Cria um novo endereço para o usuário autenticado.
   * Validações: cep (8 dígitos), logradouro (1-200), numero (1-20), cidade_estado (1-100).
   * Limite: máximo 10 endereços por usuário.
   */
  async criar(req, res) {
    try {
      const usuario_id = req.usuario_id;
      const { cep, logradouro, numero, bairro, cidade_estado } = req.body;

      // Validação de campos obrigatórios e formatos
      const fields = {};

      if (!cep || !/^\d{8}$/.test(cep)) {
        fields.cep = "CEP deve conter exatamente 8 dígitos numéricos.";
      }

      if (!logradouro || logradouro.length < 1 || logradouro.length > 200) {
        fields.logradouro = "Logradouro deve ter entre 1 e 200 caracteres.";
      }

      if (!numero || numero.length < 1 || numero.length > 20) {
        fields.numero = "Número deve ter entre 1 e 20 caracteres.";
      }

      if (!cidade_estado || cidade_estado.length < 1 || cidade_estado.length > 100) {
        fields.cidade_estado = "Cidade/Estado deve ter entre 1 e 100 caracteres.";
      }

      if (Object.keys(fields).length > 0) {
        return res.status(400).json({ error: "Campos inválidos.", fields });
      }

      // Verificar limite de 10 endereços por usuário
      const countResult = await sql`
        SELECT COUNT(*)::int AS total FROM enderecos WHERE usuario_id = ${usuario_id}
      `;

      if (countResult[0].total >= 10) {
        return res.status(400).json({ error: "Limite de 10 endereços atingido." });
      }

      // Inserir novo endereço
      const resultado = await sql`
        INSERT INTO enderecos (id, usuario_id, cep, logradouro, numero, bairro, cidade_estado)
        VALUES (gen_random_uuid(), ${usuario_id}, ${cep}, ${logradouro}, ${numero}, ${bairro || ''}, ${cidade_estado})
        RETURNING id, cep, logradouro, numero, bairro, cidade_estado, criado_em
      `;

      return res.status(201).json(resultado[0]);
    } catch (error) {
      console.error("Erro ao criar endereço:", error);
      return res.status(500).json({ error: "Erro interno ao salvar o endereço." });
    }
  },

  /**
   * DELETE /api/enderecos/:id
   * Remove um endereço do usuário autenticado.
   * Verifica ownership e se não há aluguéis ativos vinculados.
   */
  async remover(req, res) {
    try {
      const usuario_id = req.usuario_id;
      const { id } = req.params;

      // Verificar se o endereço existe e pertence ao usuário
      const endereco = await sql`
        SELECT id, usuario_id FROM enderecos WHERE id = ${id}
      `;

      if (endereco.length === 0) {
        return res.status(404).json({ error: "Endereço não encontrado." });
      }

      if (endereco[0].usuario_id !== usuario_id) {
        return res.status(403).json({ error: "Acesso negado. Este endereço pertence a outro usuário." });
      }

      // Verificar se há aluguéis ativos vinculados ao endereço
      const alugueisAtivos = await sql`
        SELECT COUNT(*)::int AS total
        FROM alugueis
        WHERE endereco_id = ${id}
          AND status_aluguel IN ('AGUARDANDO_ENTREGA', 'EM_USO', 'AGUARDANDO_RETIRADA')
      `;

      if (alugueisAtivos[0].total > 0) {
        return res.status(400).json({
          error: "Não é possível remover este endereço pois há pedidos ativos vinculados."
        });
      }

      // Deletar o endereço
      await sql`DELETE FROM enderecos WHERE id = ${id}`;

      return res.status(200).json({ message: "Endereço removido com sucesso." });
    } catch (error) {
      console.error("Erro ao remover endereço:", error);
      return res.status(500).json({ error: "Erro interno ao remover endereço." });
    }
  }
};

module.exports = enderecosController;
