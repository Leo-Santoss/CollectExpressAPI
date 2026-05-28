require("dotenv").config();
const express = require("express");
const cors = require("cors");

// Inicializa o aplicativo Express
const app = express();

// --- Middlewares Globais ---
app.use(cors()); // Permite que o front-end faça requisições para a API
app.use(express.json()); // Permite que a API receba e envie dados no formato JSON

// --- Rota de Health Check ---
// Rota simples para verificar se o servidor está no ar
app.get("/api/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    message: "API de Caçambas operando normalmente! 🚀",
    timestamp: new Date().toISOString()
  });
});

// --- Importação das Rotas (Vamos criar nos próximos passos) ---
const authRoutes = require("./routes/authRoutes");
const usuariosRoutes = require("./routes/usuariosRoutes");
const cacambasRoutes = require("./routes/cacambasRoutes");
const enderecosRoutes = require("./routes/enderecosRoutes");
const cacambeirosRoutes = require("./routes/cacambeirosRoutes");
const carrinhoRoutes = require("./routes/carrinhoRoutes");
const alugueisRoutes = require("./routes/alugueisRoutes");
const avaliacoesRoutes = require("./routes/avaliacoesRoutes");
const adminRoutes = require("./routes/adminRoutes");

// --- Definição dos Endpoints ---
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/cacambas", cacambasRoutes);
app.use("/api/enderecos", enderecosRoutes);
app.use("/api/cacambeiros", cacambeirosRoutes);
app.use("/api/carrinho", carrinhoRoutes);
app.use("/api/alugueis", alugueisRoutes);
app.use("/api/avaliacoes", avaliacoesRoutes);
app.use("/api/admin", adminRoutes);

// --- Middleware para Rotas Não Encontradas (404) ---
app.use((req, res, next) => {
  res.status(404).json({ error: "Endpoint não encontrado." });
});

// --- Inicialização do Servidor ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Api: http://localhost:${PORT}/api/`);
});