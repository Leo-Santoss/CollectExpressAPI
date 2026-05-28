# Implementation Plan: CollectExpress Marketplace

## Overview

This plan implements the complete CollectExpress marketplace platform for dumpster rentals across two projects: CollectExpressAPI (Node.js/Express backend with NeonDB/PostgreSQL) and CollectExpressAPP (React Native/Expo frontend with TypeScript). Tasks are organized to build foundational layers first (database, middleware, shared components), then feature modules incrementally, wiring everything together at the end.

## Tasks

- [x] 1. Backend foundation: Database schema, middleware, and configuration
  - [x] 1.1 Create database schema migration script with all tables
    - Create `src/database/schema.sql` with CREATE TABLE statements for: usuarios, detalhes_cacambeiro, cacambas, enderecos, carrinho, itens_carrinho, alugueis, itens_aluguel, avaliacoes, categorias
    - Include UUID primary keys, enums (tipo_perfil, status_aluguel, status_pagamento), foreign keys, unique constraints, and indexes
    - Create `src/database/db.js` wrapping @neondatabase/serverless with sql tagged template helper
    - _Requirements: 1.1, 1.6, 6.4, 10.2_

  - [x] 1.2 Implement validation middleware factory
    - Create `src/middlewares/validationMiddleware.js` as a factory function accepting schema rules
    - Support field presence, type, length (min/max), format (email RFC 5322, digits-only), and custom validators
    - Return 400 with field-specific error messages in Portuguese
    - _Requirements: 1.3, 1.4, 2.2, 10.3_

  - [x] 1.3 Implement auth middleware (JWT verification)
    - Create `src/middlewares/authMiddleware.js` that extracts and verifies JWT from Authorization header
    - Attach `usuario_id` and `tipo_perfil` to `req` on success
    - Return 401 with generic message on missing/invalid/expired token
    - _Requirements: 2.1, 2.8, 22.1_

  - [x] 1.4 Implement role middleware
    - Create `src/middlewares/roleMiddleware.js` as a factory accepting allowed roles array
    - Check `req.tipo_perfil` against allowed roles, return 403 if unauthorized
    - _Requirements: 10.7, 11.5, 12.6, 14.4, 15.1, 16.5, 17.2_

  - [x] 1.5 Implement rate limiting middleware
    - Create `src/middlewares/rateLimitMiddleware.js` with IP-based tracking
    - Block after 5 failed login attempts within 15-minute window
    - Return 429 with retry-after information
    - _Requirements: 2.4_

  - [x] 1.6 Write property tests for validation middleware
    - **Property 1: Registration validation rejects invalid inputs**
    - **Validates: Requirements 1.3, 1.4, 1.8**
    - Use fast-check to generate invalid payloads and verify 400 responses with field-specific errors

  - [x] 1.7 Write property tests for role-based access control
    - **Property 26: Role-based access control enforcement**
    - **Validates: Requirements 10.7, 11.5, 12.6, 14.4, 15.1, 16.5, 17.2**
    - Use fast-check to generate requests with mismatched roles and verify 403 responses

- [x] 2. Backend: Authentication module (register, login, password recovery)
  - [x] 2.1 Implement user registration endpoint
    - Create `src/controllers/authController.js` with `register` function
    - Create `src/routes/authRoutes.js` with POST `/api/auth/register`
    - Validate all fields (nome_completo, email, senha, tipo_perfil, documento, telefone)
    - Hash password with bcrypt salt factor 10
    - For CACAMBEIRO, validate and store business details in detalhes_cacambeiro
    - Return 201 with user data excluding senha_hash; return 409 for duplicate email/documento
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 2.2 Write property tests for registration
    - **Property 2: Registration with valid data produces correct response**
    - **Property 3: Duplicate email or documento prevents registration**
    - **Property 4: Password hashing round-trip**
    - **Validates: Requirements 1.1, 1.2, 1.6, 1.7**
    - Create `tests/properties/registration.property.test.js`

  - [x] 2.3 Implement login endpoint
    - Add `login` function to authController
    - Add POST `/api/auth/login` route with rate limiting middleware
    - Validate email format and senha length before authentication attempt
    - Compare password with bcrypt, return JWT (24h expiry) with id and tipo_perfil in payload
    - Return 401 with generic "Credenciais inválidas" for invalid credentials
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.4 Write property tests for authentication
    - **Property 5: Login returns JWT with correct payload**
    - **Property 6: Invalid credentials return generic error**
    - **Property 7: Login validation rejects malformed input**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - Create `tests/properties/authentication.property.test.js`

  - [x] 2.5 Implement password recovery endpoints
    - Add `forgotPassword` function: generate single-use recovery token (15 min expiry), invalidate previous tokens, return success regardless of email existence
    - Add `resetPassword` function: validate token, enforce password policy, update hash, invalidate token, terminate sessions
    - Add POST `/api/auth/forgot-password` and POST `/api/auth/reset-password` routes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.6 Write property tests for password recovery
    - **Property 8: Password recovery does not leak email existence**
    - **Property 9: Password reset with valid token updates hash and invalidates sessions**
    - **Property 10: Password policy enforcement**
    - **Validates: Requirements 3.2, 3.3, 3.5**
    - Create `tests/properties/password-recovery.property.test.js`

- [ ] 3. Checkpoint - Backend auth module
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend: Dumpster (caçamba) management module
  - [x] 4.1 Implement dumpster CRUD endpoints
    - Create `src/controllers/cacambasController.js` with listar, detalhe, criar, atualizar, remover functions
    - Create `src/routes/cacambasRoutes.js` with GET/POST/PUT/DELETE routes
    - GET `/api/cacambas` returns available dumpsters with pagination (20/page), search, and filters (tipo_residuo, cacambeiro)
    - GET `/api/cacambas/:id` returns full detail with cacambeiro info and up to 10 most recent reviews
    - POST requires CACAMBEIRO role, validates fields, sets disponivel=true by default
    - DELETE checks for active orders before allowing deletion
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 5.1, 5.2, 5.3, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 4.2 Write property tests for marketplace filtering and pagination
    - **Property 11: Marketplace filtering returns only matching results**
    - **Property 12: Pagination returns correct page size**
    - **Property 13: Reviews limited to 10 most recent per cacambeiro**
    - **Validates: Requirements 4.2, 4.3, 4.5, 5.3**
    - Create `tests/properties/marketplace-filtering.property.test.js`

  - [x] 4.3 Write property tests for dumpster CRUD
    - **Property 23: Dumpster CRUD ownership isolation**
    - **Property 24: Dumpster deletion constraint**
    - **Property 25: Dumpster validation rejects invalid data**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.5, 10.6**
    - Create `tests/properties/dumpster-crud.property.test.js`

- [x] 5. Backend: Cart and checkout module
  - [x] 5.1 Implement cart endpoints
    - Create `src/controllers/carrinhoController.js` with obter, adicionarItem, atualizarItem, limpar functions
    - Create `src/routes/carrinhoRoutes.js` with GET/POST/PUT/DELETE routes (CONSUMIDOR role)
    - Enforce single-cacambeiro constraint: reject items from different cacambeiro
    - Validate quantidade (1-10) and dias_aluguel (1-90)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 5.2 Implement checkout endpoint
    - Create `src/controllers/alugueisController.js` with `checkout` function
    - Add POST `/api/alugueis/checkout` route (CONSUMIDOR role)
    - Validate data_inicio (1-60 days from today), dias_aluguel (1-30), endereco_id existence
    - Calculate preco_final: sum(quantidade × dias_aluguel × preco_diaria) + taxa_entrega
    - Create aluguel with status_aluguel="AGUARDANDO_ENTREGA", status_pagamento="PENDENTE"
    - Create itens_aluguel records, clear cart after successful checkout
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 5.3 Write property tests for cart logic
    - **Property 17: Cart enforces single-cacambeiro constraint**
    - **Property 18: Cart item quantity and duration constraints**
    - **Property 19: Cart clear removes all items**
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.5, 7.7**
    - Create `tests/properties/cart.property.test.js`

  - [x] 5.4 Write property tests for checkout and pricing
    - **Property 14: Price calculation correctness**
    - **Property 15: Checkout date validation**
    - **Property 16: Checkout creates order with correct initial status**
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.6, 6.7**
    - Create `tests/properties/pricing-checkout.property.test.js`

- [x] 6. Backend: Order management and reviews module
  - [x] 6.1 Implement consumer order endpoints
    - Add `meusPedidos` function to alugueisController
    - Add GET `/api/alugueis/meus` route (CONSUMIDOR role) with pagination (20/page), sorted by data_pedido descending
    - Return order details including cacambeiro nome_completo
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 6.2 Implement cacambeiro order management endpoints
    - Add `gestaoPedidos` and `atualizarStatus` functions to alugueisController
    - Add GET `/api/alugueis/gestao` (CACAMBEIRO role) sorted by data_inicio ascending
    - Add PATCH `/api/alugueis/:id/status` (CACAMBEIRO role) with sequential forward-only state machine
    - Reject backward transitions, step-skipping, and updates to FINALIZADO orders
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 6.3 Implement review endpoints
    - Create `src/controllers/avaliacoesController.js` with criar and listarPorCacambeiro functions
    - Create `src/routes/avaliacoesRoutes.js` with POST `/api/avaliacoes` (CONSUMIDOR) and GET `/api/avaliacoes/cacambeiro/:id`
    - Validate: order is FINALIZADO, belongs to consumer, no existing review, nota 1-5, comentario max 500 chars
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 6.4 Write property tests for order status transitions
    - **Property 20: Order status transitions are strictly sequential and forward-only**
    - **Property 21: Status color mapping is deterministic and distinct**
    - **Validates: Requirements 11.2, 11.6, 11.7, 8.4, 11.3**
    - Create `tests/properties/order-status.property.test.js`

  - [x] 6.5 Write property tests for review submission
    - **Property 22: Review submission constraints**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
    - Create `tests/properties/review.property.test.js`

- [x] 7. Checkpoint - Backend core business logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Backend: Address, profile, dashboard, and admin modules
  - [x] 8.1 Implement address endpoints
    - Create `src/controllers/enderecosController.js` with listar, criar, remover functions
    - Create `src/routes/enderecosRoutes.js` with GET/POST/DELETE routes
    - Validate cep (8 digits), logradouro (1-200), numero (1-20), cidade_estado (1-100)
    - Enforce max 10 addresses per user, ownership isolation, deletion constraint (no active orders)
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [x] 8.2 Implement user profile endpoints
    - Create `src/controllers/usuariosController.js` with getPerfil, updatePerfil functions
    - Create `src/routes/usuariosRoutes.js` with GET/PUT `/api/usuarios/perfil`
    - Validate nome_completo (3-120 chars), telefone (10-15 digits); email/documento/tipo_perfil are read-only
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 8.3 Implement cacambeiro dashboard and financial endpoints
    - Create `src/controllers/cacambeirosController.js` with dashboard and financeiro functions
    - Create `src/routes/cacambeirosRoutes.js` with GET `/api/cacambeiros/dashboard` and GET `/api/cacambeiros/financeiro`
    - Dashboard: total_orders, active_orders, total_revenue, nota_media
    - Financial: filtered by date range (max 12 months), default current month, sorted by data_pedido desc
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 8.4 Implement admin dashboard endpoint
    - Create `src/controllers/adminController.js` with dashboard function
    - Add GET `/api/admin/dashboard` (ADMIN role)
    - Return total_users, total_orders, total_revenue, active_cacambeiros, orders_by_status, orders_over_time (daily/weekly)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 8.5 Implement admin user management endpoints
    - Add listarUsuarios and detalheUsuario to usuariosController
    - Add GET `/api/usuarios` (ADMIN, paginated 20/page) with tipo_perfil filter and text search (min 3 chars)
    - Add GET `/api/usuarios/:id` (ADMIN) with addresses and order history
    - Never include senha_hash in responses
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x] 8.6 Implement admin order management endpoints
    - Add listarTodos to alugueisController
    - Add GET `/api/alugueis` (ADMIN, paginated) with status_aluguel, status_pagamento filters and text search
    - Order detail includes consumer/cacambeiro names, address, itens_aluguel
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 8.7 Implement admin category management endpoints
    - Add CRUD functions to adminController for categorias
    - Add GET/POST/PUT/DELETE `/api/admin/categorias` routes (ADMIN role)
    - Validate name uniqueness (case-insensitive), non-empty, max 100 chars
    - Prevent deletion of categories with associated dumpsters
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x] 8.8 Write property tests for address, profile, and admin modules
    - **Property 34: Profile update validation**
    - **Property 35: Address creation validation**
    - **Property 36: Address deletion constraint**
    - **Property 37: Address ownership isolation**
    - **Property 38: Maximum address limit enforcement**
    - **Validates: Requirements 19.2, 19.3, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7**
    - Create `tests/properties/address-profile.property.test.js`

  - [x] 8.9 Write property tests for dashboard metrics and admin search
    - **Property 27: Dashboard metrics calculation correctness**
    - **Property 28: Financial data filtering correctness**
    - **Property 29: Admin dashboard platform-wide statistics**
    - **Property 30: Admin user search and filter**
    - **Property 31: Admin order search and filter**
    - **Property 32: Category name uniqueness (case-insensitive)**
    - **Property 33: Category deletion constraint**
    - **Validates: Requirements 12.1, 12.2, 13.1, 13.2, 13.3, 14.1, 14.3, 15.3, 15.4, 16.2, 16.3, 17.3, 17.5**
    - Create `tests/properties/dashboard-admin.property.test.js`

- [x] 9. Backend: Wire all routes into Express server
  - [x] 9.1 Register all route modules in server.js
    - Import and mount all route modules (authRoutes, cacambasRoutes, carrinhoRoutes, alugueisRoutes, avaliacoesRoutes, enderecosRoutes, usuariosRoutes, cacambeirosRoutes, adminRoutes) on the Express app
    - Configure CORS, JSON body parsing, and error handling middleware
    - Ensure rate limiter is applied to login route
    - _Requirements: 22.1, 2.4_

- [x] 10. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Frontend foundation: Theme, types, API layer, and shared components
  - [x] 11.1 Set up theme system and type definitions
    - Create `src/theme/colors.ts`, `src/theme/spacing.ts`, `src/theme/typography.ts`, `src/theme/radius.ts`, `src/theme/shadows.ts`
    - Create `src/theme/ThemeProvider.tsx` and `src/hooks/useTheme.ts`
    - Create all TypeScript interfaces in `src/types/` (user.ts, cacamba.ts, order.ts, cart.ts, address.ts, review.ts, category.ts)
    - _Requirements: 21.2, 21.4_

  - [x] 11.2 Set up API service layer with Axios
    - Create `src/services/api.ts` with Axios instance (baseURL from env, 15s timeout)
    - Implement request interceptor for JWT injection (Authorization: Bearer header)
    - Implement response interceptor: 401 → clear token + redirect to login; network error → toast; timeout → toast; 5xx → toast
    - _Requirements: 22.1, 22.2, 22.3, 22.5, 22.6_

  - [x] 11.3 Create typed service modules
    - Create `src/services/authService.ts` (login, register, forgotPassword, resetPassword)
    - Create `src/services/cacambasService.ts` (listar, detalhe, criar, atualizar, remover)
    - Create `src/services/carrinhoService.ts` (obter, adicionarItem, atualizarItem, limpar)
    - Create `src/services/alugueisService.ts` (checkout, meusPedidos, gestaoPedidos, atualizarStatus, listarTodos)
    - Create `src/services/avaliacoesService.ts` (criar, listarPorCacambeiro)
    - Create `src/services/enderecosService.ts` (listar, criar, remover)
    - Create `src/services/usuariosService.ts` (getPerfil, updatePerfil, listarUsuarios, detalheUsuario)
    - Create `src/services/cacambeirosService.ts` (dashboard, financeiro)
    - Create `src/services/adminService.ts` (dashboard, categorias CRUD)
    - _Requirements: 22.4_

  - [x] 11.4 Build reusable UI component library
    - Create `src/components/ui/Button.tsx` (primary, secondary, outline, ghost variants; loading, disabled states; 44x44 min touch target)
    - Create `src/components/ui/Card.tsx` (surface container with shadow and border radius from theme)
    - Create `src/components/ui/TextInputField.tsx` (label, placeholder, error message, secureTextEntry)
    - Create `src/components/ui/Badge.tsx` (success, warning, default variants)
    - Create `src/components/ui/StatusChip.tsx` (color-coded per status_aluguel)
    - Create `src/components/ui/Avatar.tsx` (user initials when no image)
    - Create `src/components/ui/EmptyState.tsx` (title, description, optional action button)
    - Create `src/components/ui/LoadingSpinner.tsx` (with optional message text)
    - All components use useTheme hook, @expo/vector-icons, accessibilityLabel/accessibilityRole
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6_

  - [x] 11.5 Create shared hooks
    - Create `src/hooks/useFetch.ts` (generic data fetching hook with loading/error/data states)
    - Create `src/hooks/useDebounce.ts` (debounce search input, 300ms default)
    - Create `src/hooks/useToast.ts` (toast notification management, auto-dismiss 5s)
    - _Requirements: 23.1, 23.3, 23.4, 4.3_

  - [x] 11.6 Write property tests for error display
    - **Property 39: Error messages contain no technical details**
    - **Validates: Requirements 23.3**
    - Create `__tests__/properties/error-display.property.test.ts`
    - Use fast-check to generate various API error responses and verify displayed messages contain no status codes or stack traces

- [x] 12. Frontend: Authentication flow and context
  - [x] 12.1 Implement AuthContext provider
    - Create `src/context/AuthContext.tsx` with user, token, isLoading, login, register, logout
    - Persist JWT to secure storage (expo-secure-store or AsyncStorage)
    - On app launch: check stored token validity, navigate accordingly
    - Clear token and redirect on 401 or expired/malformed token
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 18.4_

  - [x] 12.2 Implement auth screens
    - Create `src/app/(auth)/_layout.tsx` (Stack navigator)
    - Create `src/app/(auth)/login.tsx` (email + senha fields, validation, error display)
    - Create `src/app/(auth)/register.tsx` (all fields, tipo_perfil selection, CACAMBEIRO business details)
    - Create `src/app/(auth)/forgot-password.tsx` (email input, recovery request)
    - _Requirements: 1.1, 1.5, 2.1, 3.1, 18.4_

  - [x] 12.3 Implement root layout and navigation routing
    - Create `src/app/_layout.tsx` wrapping app with ThemeProvider and AuthProvider
    - Create `src/app/index.tsx` with redirect logic based on auth state and tipo_perfil
    - Navigate to (auth) if unauthenticated, (consumer)/(cacambeiro)/(admin) based on tipo_perfil
    - Handle invalid tipo_perfil by clearing session and redirecting to auth
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

- [x] 13. Checkpoint - Frontend foundation and auth
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Frontend: Consumer flow (marketplace, details, cart, orders, reviews)
  - [x] 14.1 Implement consumer tab layout
    - Create `src/app/(consumer)/_layout.tsx` with bottom tabs: Home (Marketplace), Meus Pedidos, Carrinho, Perfil
    - Use @expo/vector-icons for tab icons
    - _Requirements: 18.1, 18.5_

  - [x] 14.2 Implement marketplace listing screen
    - Create `src/app/(consumer)/(home)/index.tsx`
    - Display dumpster cards (nome, tipo_residuo, tamanho_m3, preco_diaria, foto_url, cacambeiro nome)
    - Implement tipo_residuo and cacambeiro filters (AND logic)
    - Implement search field (triggers at 3+ chars, case-insensitive)
    - Implement pagination (20 items/page, load more on scroll)
    - Pull-to-refresh with RefreshControl
    - Loading spinner, empty state, error state with retry
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 23.1, 23.5, 23.6_

  - [x] 14.3 Implement dumpster detail screen
    - Create `src/app/(consumer)/(home)/[id].tsx`
    - Display full dumpster info, cacambeiro profile (nome, telefone, horarios, raio, nota_media, taxa_entrega)
    - Display up to 10 most recent reviews (nota, comentario, data_avaliacao, reviewer nome)
    - Add-to-cart button: enabled when disponivel=true, disabled with message when false
    - Empty state for no reviews
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 14.4 Implement CartContext and cart screen
    - Create `src/context/CartContext.tsx` with cart state, addItem, updateItem, clearCart
    - Enforce single-cacambeiro constraint with warning dialog
    - Create `src/app/(consumer)/carrinho.tsx` displaying cart items, quantities, subtotals, running total
    - Implement quantity update (1-10), clear cart action
    - Empty state with navigation to marketplace
    - Checkout section: date picker (data_inicio 1-60 days), dias_aluguel selector (1-30), address selection
    - Price breakdown display (subtotal + taxa_entrega = preco_final)
    - Checkout confirmation → order creation → clear cart → navigate to confirmation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 14.5 Write property tests for cart logic (frontend)
    - **Property 17: Cart enforces single-cacambeiro constraint**
    - **Property 18: Cart item quantity and duration constraints**
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.7**
    - Create `__tests__/properties/cart.property.test.ts`

  - [x] 14.6 Implement consumer orders screen
    - Create `src/app/(consumer)/pedidos/index.tsx` listing orders (20/page, sorted by data_pedido desc)
    - Display status_aluguel with color-coded StatusChip, status_pagamento, data_inicio, dias_aluguel, preco_final, cacambeiro nome
    - Empty state for no orders, error state with retry
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

  - [x] 14.7 Implement consumer order detail and review submission
    - Create `src/app/(consumer)/pedidos/[id].tsx` with full order details
    - Show review option when status_aluguel="FINALIZADO" and no existing review
    - Star-rating input (5 stars, default no selection), optional comentario (max 500 chars)
    - Validate nota 1-5, submit review, show confirmation
    - Handle already-reviewed, not-FINALIZADO, and permission errors
    - _Requirements: 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 15. Checkpoint - Consumer flow complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Frontend: Cacambeiro flow (dashboard, dumpsters, orders, financial)
  - [x] 16.1 Implement cacambeiro tab layout
    - Create `src/app/(cacambeiro)/_layout.tsx` with bottom tabs: Dashboard, Minhas Caçambas, Pedidos, Financeiro, Perfil
    - _Requirements: 18.2, 18.5_

  - [x] 16.2 Implement cacambeiro dashboard screen
    - Create `src/app/(cacambeiro)/dashboard.tsx`
    - Display total_orders, active_orders, total_revenue, nota_media (or "Sem avaliações")
    - Tappable shortcuts to "Minhas Caçambas" and "Gestão de Pedidos"
    - Skeleton loading state, error state with retry
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 16.3 Implement cacambeiro dumpster management screens
    - Create `src/app/(cacambeiro)/cacambas/index.tsx` listing own dumpsters (sorted by criado_em desc)
    - Create `src/app/(cacambeiro)/cacambas/criar.tsx` with form (nome, tipo_residuo, tamanho_m3, preco_diaria, foto_url)
    - Create `src/app/(cacambeiro)/cacambas/[id].tsx` for editing (preco_diaria, disponivel, foto_url) and deleting
    - Validation errors inline, deletion constraint error display
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 16.4 Implement cacambeiro order management screens
    - Create `src/app/(cacambeiro)/pedidos/index.tsx` listing orders (sorted by data_inicio asc)
    - Display status_aluguel with color-coded badges, consumer name, endereco, data_inicio, dias_aluguel, preco_final
    - Create `src/app/(cacambeiro)/pedidos/[id].tsx` with status advancement button (next valid state)
    - Handle forward-only transitions, reject backward/skip/FINALIZADO updates
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.7_

  - [x] 16.5 Implement cacambeiro financial screen
    - Create `src/app/(cacambeiro)/financeiro.tsx`
    - List FINALIZADO+PAGO orders with preco_final and data_pedido (sorted desc)
    - Monthly summary (total revenue + order count)
    - Date range filter (max 12 months), default current month
    - Loading indicator, error with retry, empty state
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [x] 17. Frontend: Admin flow (dashboard, users, orders, categories)
  - [x] 17.1 Implement admin tab layout
    - Create `src/app/(admin)/_layout.tsx` with bottom tabs: Dashboard, Usuários, Pedidos, Categorias, Perfil
    - _Requirements: 18.3, 18.5_

  - [x] 17.2 Implement admin dashboard screen
    - Create `src/app/(admin)/dashboard.tsx`
    - Display total_users, total_orders, total_revenue, active_cacambeiros
    - Orders-over-time graph (last 30 days, daily/weekly toggle)
    - Orders-by-status breakdown (count per status_aluguel)
    - Loading indicator (max 10s timeout), error with retry
    - _Requirements: 14.1, 14.2, 14.3, 14.5, 14.6_

  - [x] 17.3 Implement admin user management screens
    - Create `src/app/(admin)/usuarios/index.tsx` with paginated user list (20/page, sorted by criado_em desc)
    - Display nome_completo, email, tipo_perfil, criado_em
    - Filter by tipo_perfil, text search (min 3 chars) by nome_completo or email
    - Create `src/app/(admin)/usuarios/[id].tsx` with user detail (id, nome, email, tipo_perfil, documento, telefone, criado_em, addresses, order history)
    - Empty state for no results
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x] 17.4 Implement admin order management screens
    - Create `src/app/(admin)/pedidos/index.tsx` with paginated order list
    - Display consumer name, cacambeiro name, status_aluguel, status_pagamento, preco_final, data_pedido
    - Filter by status_aluguel and status_pagamento, text search (min 1 char)
    - Create `src/app/(admin)/pedidos/[id].tsx` with full order detail (names, statuses, prices, dates, address, itens_aluguel)
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.6_

  - [x] 17.5 Implement admin category management screen
    - Create `src/app/(admin)/categorias.tsx` with CRUD interface
    - List categories with name and associated dumpster count
    - Create/edit form with validation (non-empty, max 100 chars, unique case-insensitive)
    - Delete with warning when associated dumpsters exist (show count, prevent deletion)
    - Preserve input on validation failure
    - _Requirements: 17.1, 17.3, 17.4, 17.5, 17.6_

- [x] 18. Frontend: Profile and address management (shared across profiles)
  - [x] 18.1 Implement profile screen
    - Create `src/app/(consumer)/perfil/index.tsx`, `src/app/(cacambeiro)/perfil.tsx`, `src/app/(admin)/perfil.tsx`
    - Display nome_completo (editable), telefone (editable), email/documento/tipo_perfil (read-only)
    - CACAMBEIRO: additionally show business details (horario_inicio, horario_fim, raio_entrega_km, taxa_entrega) as read-only
    - Validate on submit (nome 3-120, telefone 10-15 digits), show success/error
    - Logout action: clear token, navigate to login
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 18.2 Implement address management screen
    - Create `src/app/(consumer)/perfil/enderecos.tsx`
    - List saved addresses (cep, logradouro, numero, bairro, cidade_estado), max 10
    - Add new address form with validation (cep 8 digits, logradouro 1-200, numero 1-20, cidade_estado 1-100)
    - Delete address (with constraint check for active orders)
    - Error messages for max limit reached, active order constraint, validation failures
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.7_

  - [x] 18.3 Write property tests for frontend filtering logic
    - **Property 11: Marketplace filtering returns only matching results**
    - **Validates: Requirements 4.2, 4.3**
    - Create `__tests__/properties/filtering.property.test.ts`
    - Test filter AND logic and case-insensitive search with generated data

- [x] 19. Checkpoint - All frontend screens complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Integration: Loading states, error handling, and final wiring
  - [x] 20.1 Implement global loading and error state patterns
    - Add skeleton placeholders on all list screens during data fetch
    - Add spinner on action buttons during submit/delete/update
    - Implement toast notification system (auto-dismiss 5s, non-technical messages)
    - Implement pull-to-refresh (RefreshControl) on all scrollable list screens
    - Implement EmptyState component usage on all screens with zero-item states
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

  - [x] 20.2 Final integration and navigation wiring
    - Verify all navigation flows work end-to-end across profiles
    - Ensure token expiry during active use redirects to login within 2s
    - Verify CartContext integrates with checkout flow
    - Ensure all API service calls use typed responses
    - Verify disabled button states (opacity 0.5, gray background, no onPress)
    - _Requirements: 18.6, 18.7, 21.6, 22.3_

  - [x] 20.3 Write integration tests for critical flows
    - Test registration → login → marketplace → add to cart → checkout flow
    - Test cacambeiro order status advancement flow
    - Test admin user/order search and filter flows
    - _Requirements: 1.1, 2.1, 6.4, 11.2_

- [x] 21. Final checkpoint - Full platform integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness properties from the design document (39 properties total)
- Unit tests validate specific examples and edge cases
- Backend tasks (1-10) use JavaScript with Node.js/Express and NeonDB sql tagged templates
- Frontend tasks (11-21) use TypeScript with React Native/Expo and expo-router
- The backend uses @neondatabase/serverless, bcryptjs, jsonwebtoken, express, cors, dotenv
- The frontend uses expo-router, axios, @expo/vector-icons, and the existing Expo SDK 56 dependencies
- All API error responses follow the consistent format: `{ error: string, fields?: Record<string, string> }`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "11.1"] },
    { "id": 1, "tasks": ["1.3", "1.4", "1.5", "11.2"] },
    { "id": 2, "tasks": ["1.6", "1.7", "2.1", "11.3", "11.4", "11.5"] },
    { "id": 3, "tasks": ["2.2", "2.3", "11.6"] },
    { "id": 4, "tasks": ["2.4", "2.5", "12.1"] },
    { "id": 5, "tasks": ["2.6", "4.1", "12.2", "12.3"] },
    { "id": 6, "tasks": ["4.2", "4.3", "5.1", "14.1"] },
    { "id": 7, "tasks": ["5.2", "5.3", "14.2", "14.3"] },
    { "id": 8, "tasks": ["5.4", "6.1", "6.2", "6.3", "14.4"] },
    { "id": 9, "tasks": ["6.4", "6.5", "14.5", "14.6", "14.7"] },
    { "id": 10, "tasks": ["8.1", "8.2", "8.3", "8.4", "16.1"] },
    { "id": 11, "tasks": ["8.5", "8.6", "8.7", "16.2", "16.3"] },
    { "id": 12, "tasks": ["8.8", "8.9", "9.1", "16.4", "16.5"] },
    { "id": 13, "tasks": ["17.1", "17.2", "17.3"] },
    { "id": 14, "tasks": ["17.4", "17.5", "18.1", "18.2"] },
    { "id": 15, "tasks": ["18.3", "20.1"] },
    { "id": 16, "tasks": ["20.2", "20.3"] }
  ]
}
```
