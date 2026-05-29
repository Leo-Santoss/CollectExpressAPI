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

// GET /api/avaliacoes/cacambeiro/:id - Lista avaliações de um caçambeiro (Público)
router.get(
  "/cacambeiro/:id",
  avaliacoesController.listarPorCacambeiro
);

module.exports = router;
