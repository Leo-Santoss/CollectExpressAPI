# CollectExpress - API

A API do CollectExpress é o servidor backend responsável por orquestrar todo o marketplace. Ela fornece endpoints seguros para gerenciamento de perfis (Consumidores, Caçambeiros, Admin), catálogo de caçambas, processamento de aluguéis (pedidos) e avaliações.

**Tecnologias Utilizadas:**
- **Node.js & Express:** Ambiente de execução e framework minimalista para o servidor HTTP.
- **PostgreSQL (NeonDB):** Banco de dados relacional em nuvem.
- **Postgres.js (sql tag):** Driver otimizado para queries SQL seguras contra Injections.
- **JWT (JSON Web Tokens) & bcryptjs:** Autenticação por token e hash de senhas criptografadas.
- **@dotenvx/dotenvx:** Gerenciamento seguro e tipado de variáveis de ambiente.
