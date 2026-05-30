const express = require("express");
const router = express.Router();
const carrinhoController = require("../controllers/carrinhoController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

// Todas as rotas do carrinho requerem autenticação + perfil CONSUMIDOR
router.use(authMiddleware);
router.use(roleMiddleware(["CONSUMIDOR"]));

// GET /api/carrinho - Obter carrinho do consumidor
router.get("/", carrinhoController.obter);

// POST /api/carrinho/itens - Adicionar item ao carrinho
router.post("/itens", carrinhoController.adicionarItem);

// PUT /api/carrinho/itens/:id - Atualizar quantidade de um item
router.put("/itens/:id", carrinhoController.atualizarItem);

// DELETE /api/carrinho/itens/:id - Remover item específico do carrinho
router.delete("/itens/:id", carrinhoController.removerItem);

// DELETE /api/carrinho - Limpar carrinho
router.delete("/", carrinhoController.limpar);

module.exports = router;
