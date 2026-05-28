const express = require("express");
const router = express.Router();
const cacambeirosController = require("../controllers/cacambeirosController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

// Rotas autenticadas do caçambeiro (antes de /:id para evitar conflito)
router.get("/dashboard", authMiddleware, roleMiddleware(['CACAMBEIRO']), cacambeirosController.dashboard);
router.get("/financeiro", authMiddleware, roleMiddleware(['CACAMBEIRO']), cacambeirosController.financeiro);

// Rotas públicas para consumidores verem os fornecedores
router.get("/", cacambeirosController.listar);
router.get("/:id", cacambeirosController.buscarPorId);

const avaliacoesController = require("../controllers/avaliacoesController");

// Rota pública para listar as avaliações de um fornecedor
router.get("/:id_cacambeiro/avaliacoes", avaliacoesController.listarPorCacambeiro);

module.exports = router;