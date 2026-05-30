const sql = require("../config/db");

async function createTables() {
  try {
    console.log("Criando tabelas...");
    
    await sql`
      CREATE TABLE IF NOT EXISTS login_attempts (
        ip VARCHAR(255) PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 1,
        first_attempt BIGINT NOT NULL
      );
    `;
    console.log("Tabela login_attempts criada ou já existe.");

    await sql`
      CREATE TABLE IF NOT EXISTS revoked_tokens (
        token TEXT PRIMARY KEY,
        revoked_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    console.log("Tabela revoked_tokens criada ou já existe.");

    console.log("Tabelas criadas com sucesso.");
    process.exit(0);
  } catch (error) {
    console.error("Erro ao criar tabelas:", error);
    process.exit(1);
  }
}

createTables();
