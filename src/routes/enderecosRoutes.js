const express = require("express");
const router = express.Router();
const enderecosController = require("../controllers/enderecosController");
const authMiddleware = require("../middlewares/authMiddleware");

// Todas as rotas de endereço exigem autenticação
router.use(authMiddleware);

// GET /api/enderecos - Lista endereços do usuário autenticado
router.get("/", enderecosController.listar);

// POST /api/enderecos - Cria novo endereço para o usuário autenticado
router.post("/", enderecosController.criar);

// DELETE /api/enderecos/:id - Remove endereço (verifica ownership + pedidos ativos)
router.delete("/:id", enderecosController.remover);

module.exports = router;
