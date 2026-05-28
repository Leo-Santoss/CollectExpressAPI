const express = require("express");
const router = express.Router();
const avaliacoesController = require("../controllers/avaliacoesController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

// POST /api/avaliacoes - Consumidor submete avaliação (requer CONSUMIDOR)
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["CONSUMIDOR"]),
  avaliacoesController.criar
);

// GET /api/avaliacoes/cacambeiro/:id - Lista avaliações de um caçambeiro (qualquer perfil autenticado)
router.get(
  "/cacambeiro/:id",
  authMiddleware,
  avaliacoesController.listarPorCacambeiro
);

module.exports = router;
