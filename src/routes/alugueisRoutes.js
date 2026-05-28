const express = require("express");
const router = express.Router();
const alugueisController = require("../controllers/alugueisController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

// Todas as rotas de alugueis exigem autenticação
router.use(authMiddleware);

// Admin - Gestão de todos os pedidos
router.get("/", roleMiddleware(["ADMIN"]), alugueisController.listarTodos);

// Consumidor - Checkout e meus pedidos
router.post("/checkout", roleMiddleware(["CONSUMIDOR"]), alugueisController.checkout);
router.get("/meus", roleMiddleware(["CONSUMIDOR"]), alugueisController.meusPedidos);

// Caçambeiro - Gestão de pedidos
router.get("/gestao", roleMiddleware(["CACAMBEIRO"]), alugueisController.gestaoPedidos);
router.patch("/:id/status", roleMiddleware(["CACAMBEIRO"]), alugueisController.atualizarStatus);

module.exports = router;
