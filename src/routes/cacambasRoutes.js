const express = require("express");
const router = express.Router();
const cacambasController = require("../controllers/cacambasController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const validationMiddleware = require("../middlewares/validationMiddleware");

// Schema de validação para criação de caçamba
const criarCacambaSchema = {
  nome: {
    required: true,
    type: "string",
    minLength: 1,
    maxLength: 100
  },
  tipo_residuo: {
    required: true,
    type: "string",
    minLength: 1,
    maxLength: 50
  },
  tamanho_m3: {
    required: true,
    type: "number",
    min: 0.01,
    max: 999.99
  },
  preco_diaria: {
    required: true,
    type: "number",
    min: 0.01,
    max: 99999999.99
  }
};

// --- Rotas públicas (leitura) ---

// Rota: GET /api/cacambas
// Objetivo: Listar caçambas disponíveis no marketplace (público)
router.get("/", cacambasController.listar);

// Rota: GET /api/cacambas/:id
// Objetivo: Detalhes completos da caçamba com info do cacambeiro e avaliações (público)
router.get("/:id", cacambasController.detalhe);

// --- Rotas protegidas (Requerem autenticação) ---
router.use(authMiddleware);

// --- Rotas que requerem perfil CACAMBEIRO ---

// Rota: POST /api/cacambas
// Objetivo: Criar nova caçamba
router.post(
  "/",
  roleMiddleware(["CACAMBEIRO"]),
  validationMiddleware(criarCacambaSchema),
  cacambasController.criar
);

// Rota: PUT /api/cacambas/:id
// Objetivo: Atualizar caçamba (apenas dono)
router.put(
  "/:id",
  roleMiddleware(["CACAMBEIRO"]),
  cacambasController.atualizar
);

// Rota: DELETE /api/cacambas/:id
// Objetivo: Remover caçamba (apenas dono, sem pedidos ativos)
router.delete(
  "/:id",
  roleMiddleware(["CACAMBEIRO"]),
  cacambasController.remover
);

module.exports = router;
