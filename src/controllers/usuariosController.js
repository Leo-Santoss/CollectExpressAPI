const sql = require("../config/db");
const bcrypt = require("bcryptjs");

const usuariosController = {
  // Buscar perfil do usuário autenticado
  async getPerfil(req, res) {
    try {
      const usuarioId = req.usuario_id;

      const resultado = await sql`
        SELECT id, nome_completo, email, tipo_perfil, documento, telefone, criado_em
        FROM usuarios
        WHERE id = ${usuarioId}
      `;

      if (resultado.length === 0) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const usuario = resultado[0];

      // Se for CACAMBEIRO, buscar detalhes adicionais
      if (usuario.tipo_perfil === "CACAMBEIRO") {
        const detalhes = await sql`
          SELECT horario_inicio, horario_fim, raio_entrega_km, taxa_entrega
          FROM detalhes_cacambeiro
          WHERE usuario_id = ${usuarioId}
        `;

        if (detalhes.length > 0) {
          usuario.detalhes_cacambeiro = detalhes[0];
        }
      }

      return res.status(200).json(usuario);
    } catch (error) {
      console.error("Erro ao buscar perfil:", error);
      return res.status(500).json({ error: "Erro interno no servidor ao buscar perfil." });
    }
  },

  // Atualizar perfil do usuário autenticado (apenas nome_completo e telefone)
  async updatePerfil(req, res) {
    try {
      const usuarioId = req.usuario_id;
      const { nome_completo, telefone } = req.body;

      // Validação dos campos
      const fields = {};

      if (nome_completo !== undefined) {
        if (typeof nome_completo !== "string" || nome_completo.trim().length < 3 || nome_completo.trim().length > 120) {
          fields.nome_completo = "Nome completo deve ter entre 3 e 120 caracteres";
        }
      }

      if (telefone !== undefined) {
        if (typeof telefone !== "string" || !/^\d{10,15}$/.test(telefone)) {
          fields.telefone = "Telefone deve conter entre 10 e 15 dígitos numéricos";
        }
      }

      if (Object.keys(fields).length > 0) {
        return res.status(400).json({ error: "Dados inválidos", fields });
      }

      // Montar atualização dinâmica apenas com campos fornecidos
      if (nome_completo !== undefined && telefone !== undefined) {
        await sql`
          UPDATE usuarios
          SET nome_completo = ${nome_completo.trim()}, telefone = ${telefone}
          WHERE id = ${usuarioId}
        `;
      } else if (nome_completo !== undefined) {
        await sql`
          UPDATE usuarios
          SET nome_completo = ${nome_completo.trim()}
          WHERE id = ${usuarioId}
        `;
      } else if (telefone !== undefined) {
        await sql`
          UPDATE usuarios
          SET telefone = ${telefone}
          WHERE id = ${usuarioId}
        `;
      } else {
        // Nenhum campo editável fornecido, retornar perfil atual
      }

      // Retornar perfil atualizado (mesmo formato do GET)
      const resultado = await sql`
        SELECT id, nome_completo, email, tipo_perfil, documento, telefone, criado_em
        FROM usuarios
        WHERE id = ${usuarioId}
      `;

      if (resultado.length === 0) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const usuario = resultado[0];

      if (usuario.tipo_perfil === "CACAMBEIRO") {
        const detalhes = await sql`
          SELECT horario_inicio, horario_fim, raio_entrega_km, taxa_entrega
          FROM detalhes_cacambeiro
          WHERE usuario_id = ${usuarioId}
        `;

        if (detalhes.length > 0) {
          usuario.detalhes_cacambeiro = detalhes[0];
        }
      }

      return res.status(200).json(usuario);
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      return res.status(500).json({ error: "Erro interno no servidor ao atualizar perfil." });
    }
  },

  // Listar usuários (ADMIN) - paginado, com filtro e busca
  async listarUsuarios(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = 20;
      const offset = (page - 1) * limit;
      const { tipo_perfil, search } = req.query;

      // Montar condições dinâmicas
      let conditions = sql`WHERE 1=1`;

      if (tipo_perfil) {
        conditions = sql`${conditions} AND tipo_perfil = ${tipo_perfil}`;
      }

      if (search && search.length >= 3) {
        const searchPattern = `%${search}%`;
        conditions = sql`${conditions} AND (nome_completo ILIKE ${searchPattern} OR email ILIKE ${searchPattern})`;
      }

      // Contar total de registros
      const countResult = await sql`
        SELECT COUNT(*)::int AS total FROM usuarios ${conditions}
      `;
      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      // Buscar usuários paginados
      const usuarios = await sql`
        SELECT id, nome_completo, email, tipo_perfil, documento, telefone, criado_em
        FROM usuarios
        ${conditions}
        ORDER BY criado_em DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return res.status(200).json({
        data: usuarios,
        total,
        page,
        totalPages
      });
    } catch (error) {
      console.error("Erro ao listar usuários:", error);
      return res.status(500).json({ error: "Erro interno no servidor ao listar usuários." });
    }
  },

  // Detalhe de usuário (ADMIN) - com endereços e histórico de pedidos
  async detalheUsuario(req, res) {
    try {
      const { id } = req.params;

      // Buscar usuário (sem senha_hash)
      const resultado = await sql`
        SELECT id, nome_completo, email, tipo_perfil, documento, telefone, criado_em
        FROM usuarios
        WHERE id = ${id}
      `;

      if (resultado.length === 0) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const usuario = resultado[0];

      // Buscar endereços do usuário
      const enderecos = await sql`
        SELECT id, usuario_id, cep, logradouro, numero, bairro, cidade_estado, criado_em
        FROM enderecos
        WHERE usuario_id = ${id}
      `;

      // Buscar histórico de pedidos (alugueis onde o usuário é consumidor ou cacambeiro)
      const pedidos = await sql`
        SELECT id, consumidor_id, cacambeiro_id, endereco_id, data_pedido, data_inicio, dias_aluguel, preco_final, status_pagamento, status_aluguel
        FROM alugueis
        WHERE consumidor_id = ${id} OR cacambeiro_id = ${id}
        ORDER BY data_pedido DESC
      `;

      usuario.enderecos = enderecos;
      usuario.pedidos = pedidos;

      return res.status(200).json(usuario);
    } catch (error) {
      console.error("Erro ao buscar detalhe do usuário:", error);
      return res.status(500).json({ error: "Erro interno no servidor ao buscar detalhe do usuário." });
    }
  },

  // Criar novo usuário (Consumidor ou Caçambeiro)
  async criar(req, res) {
    try {
      const { nome_completo, email, senha, tipo_perfil, documento, telefone } = req.body;

      // 1. Validação básica de campos obrigatórios
      if (!nome_completo || !email || !senha || !tipo_perfil || !documento) {
        return res.status(400).json({ error: "Preencha todos os campos obrigatórios (nome, email, senha, tipo e documento)." });
      }

      // 2. Criptografar a senha (nunca salvar em texto plano)
      const salt = await bcrypt.genSalt(10);
      const senha_hash = await bcrypt.hash(senha, salt);

      // 3. Inserir no banco de dados
      // O NeonDB utiliza tagged template literals que tratam automaticamente o escape de variáveis, evitando SQL Injection
      const resultado = await sql`
        INSERT INTO usuarios (
          id, nome_completo, email, senha_hash, tipo_perfil, documento, telefone, criado_em
        ) VALUES (
          gen_random_uuid(), 
          ${nome_completo}, 
          ${email}, 
          ${senha_hash}, 
          ${tipo_perfil}, 
          ${documento}, 
          ${telefone}, 
          NOW()
        )
        RETURNING id, nome_completo, email, tipo_perfil, documento, telefone, criado_em;
      `;

      // Retorna o registro criado (excluindo a senha por segurança)
      return res.status(201).json({
        message: "Usuário cadastrado com sucesso!",
        usuario: resultado[0]
      });

    } catch (error) {
      console.error("Erro no cadastro de usuário:", error);
      
      // Tratamento de erro específico do PostgreSQL: Violação de Unique Constraint (código 23505)
      // Disparado se o e-mail ou documento já existirem na base
      if (error.code === '23505') {
         return res.status(409).json({ error: "Este e-mail ou documento já está cadastrado." });
      }

      return res.status(500).json({ error: "Erro interno no servidor ao tentar criar usuário." });
    }
  }
};

module.exports = usuariosController;