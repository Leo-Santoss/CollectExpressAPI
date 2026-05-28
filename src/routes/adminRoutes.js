const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

router.get("/dashboard", adminController.dashboard);

// Categorias CRUD
router.get("/categorias", adminController.listarCategorias);
router.post("/categorias", adminController.criarCategoria);
router.put("/categorias/:id", adminController.atualizarCategoria);
router.delete("/categorias/:id", adminController.removerCategoria);

module.exports = router;
