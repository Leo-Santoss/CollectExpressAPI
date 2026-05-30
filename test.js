const sql = require('./src/config/db.js');
async function test() {
  const t = await sql`SELECT COUNT(*)::int AS total FROM usuarios`;
  console.log('users', t);
  const o = await sql`SELECT COUNT(*)::int AS total FROM alugueis`;
  console.log('orders', o);
  const r = await sql`SELECT COALESCE(SUM(preco_final), 0)::numeric AS total FROM alugueis WHERE status_pagamento = 'PAGO'`;
  console.log('revenue', r);
}
test();
