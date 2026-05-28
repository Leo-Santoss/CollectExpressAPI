const { neon } = require("@neondatabase/serverless");
require("dotenv").config();

// Inicializa a conexão com o banco de dados usando a URL do .env
const sql = neon(process.env.DATABASE_URL);

// Testa a conexão (opcional, mas recomendado para debug inicial)
sql`SELECT now()`.then(() => {
  console.log("Conectado ao NeonDB!");
}).catch((err) => {
  console.error("Erro ao conectar no banco de dados:", err);
});

module.exports = sql;