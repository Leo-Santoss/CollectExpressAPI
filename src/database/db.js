const { neon } = require("@neondatabase/serverless");
require("dotenv").config();

/**
 * Inicializa a conexão com o NeonDB usando a variável DATABASE_URL.
 * Retorna uma função sql tagged template para executar queries.
 *
 * Uso:
 *   const sql = require('./db');
 *   const users = await sql`SELECT * FROM usuarios WHERE id = ${userId}`;
 */
const sql = neon(process.env.DATABASE_URL);

module.exports = sql;
