# Requirements Document

## Introduction

CollectExpress is a marketplace platform for dumpster rentals ("iFood para caçambas"). The platform connects consumers who need dumpsters for construction, renovation, or waste disposal with caçambeiros (dumpster owners/operators) who provide the service. An admin profile manages the entire platform. The system consists of a React Native/Expo mobile application (frontend) and a Node.js/Express REST API (backend) with PostgreSQL persistence. This document specifies the requirements for the complete marketplace experience across all three user profiles.

## Glossary

- **Platform**: The CollectExpress system comprising the mobile application and the backend API
- **Consumer**: A user with tipo_perfil "CONSUMIDOR" who browses, rents, and tracks dumpster services
- **Cacambeiro**: A user with tipo_perfil "CACAMBEIRO" who owns and manages dumpsters and fulfills rental orders
- **Admin**: A user with tipo_perfil "ADMIN" who manages the platform, users, orders, and categories
- **Auth_Service**: The backend authentication module responsible for login, registration, token generation, and password recovery
- **Marketplace_Screen**: The consumer-facing home screen displaying available dumpsters with search and filter capabilities
- **Order**: A rental record (alugueis table) representing a consumer's request for a dumpster service
- **Cart**: A temporary collection of dumpster items a consumer intends to rent from a single cacambeiro
- **JWT_Token**: A JSON Web Token used to authenticate and authorize API requests
- **Navigation_Router**: The expo-router based navigation system managing screen transitions and tab bars
- **State_Manager**: The client-side state management layer (Context API or Zustand) handling auth state, cart, and cached data
- **Dashboard**: A summary screen showing key metrics, charts, and quick actions for cacambeiros or admins

## Requirements

### Requirement 1: User Registration

**User Story:** As a new user, I want to register an account selecting my profile type, so that I can access the platform features appropriate to my role.

#### Acceptance Criteria

1. WHEN a user submits the registration form with valid nome_completo (between 3 and 150 characters), email (valid RFC 5322 format, maximum 255 characters), senha (between 8 and 128 characters, containing at least one uppercase letter, one lowercase letter, and one digit), tipo_perfil (CONSUMIDOR or CACAMBEIRO), documento (valid CPF with 11 digits or CNPJ with 14 digits), and telefone (between 10 and 11 digits), THE Auth_Service SHALL create the user record and return a success response containing id, nome_completo, email, tipo_perfil, documento, telefone, and criado_em, excluding the password hash
2. WHEN a user submits a registration form with an email or documento that already exists, THE Auth_Service SHALL return a 409 conflict error indicating which field is duplicated
3. WHEN a user submits a registration form with missing required fields, THE Auth_Service SHALL return a 400 error specifying which fields are missing
4. IF a user submits a registration form where any field fails its validation rules (invalid email format, senha below minimum strength, documento with invalid length, telefone outside accepted length), THEN THE Auth_Service SHALL return a 400 error indicating which fields failed validation and the reason for each failure
5. THE Platform SHALL offer profile type selection limited to CONSUMIDOR or CACAMBEIRO during the registration flow
6. WHEN a CACAMBEIRO registers, THE Platform SHALL collect additional business details: horario_inicio (time in HH:MM format, from 00:00 to 23:59), horario_fim (time in HH:MM format, from 00:00 to 23:59, must be after horario_inicio), raio_entrega_km (decimal between 1 and 200), and taxa_entrega (decimal between 0.01 and 99999.99), and store them in the detalhes_cacambeiro table
7. THE Auth_Service SHALL hash passwords using bcrypt with a salt factor of 10 before storing them
8. WHEN a CACAMBEIRO submits a registration form with missing or invalid business detail fields, THE Auth_Service SHALL return a 400 error specifying which business detail fields are invalid and the reason for each failure

### Requirement 2: User Authentication

**User Story:** As a registered user, I want to log in with my credentials and stay authenticated, so that I can access protected features without re-entering my password.

#### Acceptance Criteria

1. WHEN a user submits a valid email (RFC 5322 format, maximum 254 characters) and senha (between 8 and 128 characters), THE Auth_Service SHALL return a JWT_Token within 3 seconds with a 1-day (24-hour) expiration containing the user id and tipo_perfil in the payload
2. IF a user submits an email that does not conform to RFC 5322 format or a senha outside the 8–128 character range, THEN THE Auth_Service SHALL reject the request with a validation error message indicating which field is invalid, without attempting authentication
3. IF a user submits credentials that do not match any registered account, THEN THE Auth_Service SHALL return a 401 error with a generic "Credenciais inválidas" message without revealing whether the email or password was incorrect
4. IF the same IP address submits 5 consecutive failed login attempts within a 15-minute window, THEN THE Auth_Service SHALL block further login attempts from that IP for 15 minutes and return an error message indicating the account is temporarily locked
5. WHEN the Auth_Service returns a JWT_Token after successful authentication, THE Platform SHALL persist the JWT_Token on the device using secure storage so the user remains authenticated across app restarts
6. WHEN the app launches and a stored JWT_Token exists that has a valid signature and is not expired, THE Navigation_Router SHALL navigate the user directly to the home screen corresponding to their tipo_perfil within 2 seconds of app launch
7. WHEN the app launches and a stored JWT_Token is expired, malformed, or has an invalid signature, THE Platform SHALL clear the stored token and navigate the user to the login screen
8. WHEN an authenticated API request receives a 401 response, THE State_Manager SHALL clear the auth state, remove the stored token, and redirect the user to the login screen

### Requirement 3: Password Recovery

**User Story:** As a user who forgot my password, I want to recover access to my account, so that I can continue using the platform.

#### Acceptance Criteria

1. WHEN a user requests password recovery with a registered email, THE Auth_Service SHALL generate a single-use recovery token valid for 15 minutes and send it to the user's email address, invalidating any previously issued recovery tokens for that account
2. WHEN a user requests password recovery with an unregistered email, THE Auth_Service SHALL return a success response without revealing that the email does not exist
3. WHEN a user submits a valid recovery token with a new password that meets the password policy (minimum 8 characters, at least one uppercase letter, one lowercase letter, and one digit), THE Auth_Service SHALL update the password hash, invalidate the recovery token, and terminate all existing active sessions for that account
4. IF a user submits an expired or invalid recovery token, THEN THE Auth_Service SHALL return an error response indicating the token is invalid or expired without disclosing which condition applies
5. IF a user submits a new password that does not meet the password policy, THEN THE Auth_Service SHALL return an error response indicating the password requirements that are not satisfied

### Requirement 4: Consumer Marketplace Discovery

**User Story:** As a consumer, I want to browse available dumpsters with search and filter options, so that I can find the right service for my needs.

#### Acceptance Criteria

1. WHEN the consumer opens the Marketplace_Screen, THE Platform SHALL display a list of dumpsters where disponivel=TRUE as cards showing nome, tipo_residuo, tamanho_m3, preco_diaria, foto_url, and the cacambeiro's nome_completo, ordered by most recently created first
2. WHEN the consumer selects a tipo_residuo filter or a cacambeiro filter, THE Marketplace_Screen SHALL display only dumpsters matching all active filters combined (AND logic), updating the list within 1 second
3. WHEN the consumer types at least 3 characters in the search field, THE Marketplace_Screen SHALL filter the displayed list to dumpsters whose nome or description contains the search text (case-insensitive)
4. WHEN the consumer performs a pull-to-refresh gesture, THE Marketplace_Screen SHALL reload the dumpster listing from the API and display a loading indicator until the refresh completes
5. THE Marketplace_Screen SHALL load dumpster results in pages of 20 items, loading the next page when the user scrolls near the end of the current list
6. WHILE the dumpster list is loading, THE Marketplace_Screen SHALL display a loading spinner
7. WHEN no dumpsters match the current filters or search text, THE Marketplace_Screen SHALL display an empty state with a suggestion to adjust filters
8. IF the API request to load dumpsters fails, THEN THE Marketplace_Screen SHALL display an error message indicating the failure and provide a retry option while preserving any active filter and search state

### Requirement 5: Dumpster Details

**User Story:** As a consumer, I want to view detailed information about a dumpster and its provider, so that I can make an informed rental decision.

#### Acceptance Criteria

1. WHEN a consumer taps a dumpster card, THE Navigation_Router SHALL navigate to a detail screen showing full dumpster information (nome, tipo_residuo, tamanho_m3, preco_diaria, foto_url, disponivel)
2. THE detail screen SHALL display the cacambeiro profile information including nome_completo, telefone, horario_inicio, horario_fim, raio_entrega_km, nota_media, and taxa_entrega
3. THE detail screen SHALL display up to 10 most recent reviews (avaliacoes) for that cacambeiro sorted by data_avaliacao descending, showing nota, comentario, data_avaliacao, and the reviewer's nome_completo
4. WHEN the dumpster has disponivel equal to true, THE detail screen SHALL display an enabled button to add the dumpster to the cart
5. IF the dumpster has disponivel equal to false, THEN THE detail screen SHALL display the add-to-cart button in a disabled state with a message indicating the dumpster is currently unavailable
6. WHEN no reviews exist for the cacambeiro, THE detail screen SHALL display an empty state message indicating there are no reviews yet

### Requirement 6: Rental Scheduling and Checkout

**User Story:** As a consumer, I want to schedule a dumpster rental by selecting dates and delivery address, so that I can complete my order.

#### Acceptance Criteria

1. WHEN a consumer navigates to the checkout screen, THE Platform SHALL present a date picker for selecting the data_inicio (no earlier than 1 calendar day from the current date and no later than 60 calendar days from the current date) and a numeric selector for dias_aluguel (minimum 1 day, maximum 30 days)
2. WHEN the consumer reaches the checkout screen, THE Platform SHALL display the consumer's saved addresses for selection and provide an option to add a new address
3. WHEN the consumer has selected a data_inicio, dias_aluguel, and endereco_id, THE Platform SHALL display a price breakdown showing: item subtotal (quantidade × dias_aluguel × preco_diaria), taxa_entrega, and preco_final
4. WHEN the consumer confirms checkout with a selected endereco_id that exists in their saved addresses and a data_inicio that is at least 1 calendar day in the future, THE Platform SHALL create an Order with status_aluguel "AGUARDANDO_ENTREGA" and status_pagamento "PENDENTE"
5. IF the consumer's cart is empty at checkout, THEN THE Platform SHALL display an error message indicating that the cart has no items and prevent the checkout from proceeding
6. WHEN checkout completes successfully, THE Platform SHALL clear the cart and navigate to an order confirmation screen displaying the created order's data_inicio, dias_aluguel, endereco, and preco_final
7. IF the consumer attempts to confirm checkout without selecting an endereco_id or a data_inicio, THEN THE Platform SHALL display an error message indicating the missing fields and prevent the checkout from proceeding
8. IF taxa_entrega cannot be determined for the selected endereco_id, THEN THE Platform SHALL display an error message indicating that delivery is unavailable for the selected address and prevent the checkout from proceeding

### Requirement 7: Shopping Cart Management

**User Story:** As a consumer, I want to manage items in my cart before checkout, so that I can adjust quantities and review my selection.

#### Acceptance Criteria

1. WHEN a consumer adds a dumpster to the cart, THE Platform SHALL store the item with cacambeiro_id, cacamba_id, quantidade (between 1 and 10 units), and dias_aluguel (between 1 and 90 days)
2. IF the consumer attempts to add a dumpster from a different cacambeiro than the one already in the cart, THEN THE Platform SHALL display a warning indicating that all items must be from the same provider, and offer options to either clear the existing cart or cancel the action
3. WHEN a consumer navigates to the cart screen, THE Platform SHALL display the current cart contents including cacamba type, quantidade, dias_aluguel, unit price, subtotal per item, and a running total for all items
4. WHEN a consumer updates the quantidade of an item in the cart, THE Platform SHALL save the new quantidade (between 1 and 10 units) and recalculate the running total
5. WHEN a consumer requests to clear the cart, THE Platform SHALL remove all itens_carrinho and the carrinho record
6. IF the cart contains no items, THEN THE Platform SHALL display an empty state with a navigation element to browse the marketplace
7. IF the consumer attempts to add an item with quantidade or dias_aluguel outside the allowed range, THEN THE Platform SHALL reject the action and display an error message indicating the valid range

### Requirement 8: Consumer Order Tracking

**User Story:** As a consumer, I want to view my orders and track their status, so that I can know when my dumpster will arrive and when it will be collected.

#### Acceptance Criteria

1. THE Platform SHALL display a "Meus Pedidos" screen listing all consumer orders sorted by data_pedido descending, showing a maximum of 20 orders per page
2. IF the consumer has no orders, THEN THE Platform SHALL display an empty-state message indicating that no orders have been placed yet
3. WHEN a consumer views an order, THE Platform SHALL display status_aluguel, status_pagamento, data_inicio, dias_aluguel, preco_final, and the cacambeiro's nome_completo
4. THE Platform SHALL visually distinguish order statuses (AGUARDANDO_ENTREGA, EM_USO, AGUARDANDO_RETIRADA, FINALIZADO) using color-coded status chips, each status mapped to a distinct color
5. IF an order has status_aluguel "FINALIZADO" and the consumer has not yet submitted a review for that order, THEN THE Platform SHALL display an option to submit a review
6. IF the order list fails to load, THEN THE Platform SHALL display an error message indicating the failure and provide a retry option

### Requirement 9: Consumer Review Submission

**User Story:** As a consumer, I want to rate and review a completed rental, so that I can share my experience and help other consumers.

#### Acceptance Criteria

1. WHEN a consumer submits a review for a FINALIZADO order that belongs to them with nota (integer from 1 to 5) and optional comentario (maximum 500 characters), THE Platform SHALL create the avaliacao record with data_avaliacao set to the current date and time, and display a confirmation message indicating the review was saved
2. IF a consumer attempts to submit a review with a nota value outside the range 1 to 5 or a comentario exceeding 500 characters, THEN THE Platform SHALL reject the submission and display an error message indicating the invalid field
3. IF a consumer attempts to review an order that is not FINALIZADO, THEN THE Platform SHALL display an error message indicating that only completed orders can be reviewed
4. IF a consumer attempts to review an order they have already reviewed, THEN THE Platform SHALL display a message indicating the review already exists
5. IF a consumer attempts to review an order that does not belong to them, THEN THE Platform SHALL reject the request and display an error message indicating insufficient permission
6. THE Platform SHALL display a star-rating input component with 5 selectable stars, defaulting to no selection, for selecting the nota value

### Requirement 10: Cacambeiro Dumpster Management

**User Story:** As a cacambeiro, I want to manage my dumpster inventory (create, update, delete), so that consumers can see my current offerings.

#### Acceptance Criteria

1. THE Platform SHALL provide a "Minhas Caçambas" screen listing all dumpsters owned by the authenticated cacambeiro, ordered by criado_em descending
2. WHEN a cacambeiro submits a new dumpster with nome (1 to 100 characters), tipo_residuo (1 to 50 characters), tamanho_m3 (0.01 to 999.99), and preco_diaria (0.01 to 99,999,999.99), THE Platform SHALL create the record with disponivel defaulting to true and display it in the list
3. IF a cacambeiro submits a new dumpster with any required field (nome, tipo_residuo, tamanho_m3, preco_diaria) missing or outside its valid range, THEN THE Platform SHALL display an error message indicating which field is invalid and not create the record
4. WHEN a cacambeiro updates preco_diaria, disponivel, or foto_url of their dumpster, THE Platform SHALL persist the changes and display a success confirmation
5. WHEN a cacambeiro deletes a dumpster that has no orders with status_aluguel IN ('AGUARDANDO_ENTREGA', 'EM_USO', 'AGUARDANDO_RETIRADA'), THE Platform SHALL remove the record from the list
6. IF a cacambeiro attempts to delete a dumpster that has at least one order with status_aluguel IN ('AGUARDANDO_ENTREGA', 'EM_USO', 'AGUARDANDO_RETIRADA'), THEN THE Platform SHALL display an error message indicating the dumpster cannot be deleted due to active orders
7. IF a user with tipo_perfil other than CACAMBEIRO attempts to create a dumpster, THEN THE Platform SHALL reject the request with a forbidden error and not create the record

### Requirement 11: Cacambeiro Order Management

**User Story:** As a cacambeiro, I want to view and manage incoming orders, so that I can fulfill rental requests and update delivery status.

#### Acceptance Criteria

1. THE Platform SHALL provide a "Gestão de Pedidos" screen listing all orders assigned to the authenticated cacambeiro sorted by data_inicio ascending
2. WHEN a cacambeiro updates the status_aluguel of an order, THE Platform SHALL advance the status to the next valid state in the sequence AGUARDANDO_ENTREGA → EM_USO → AGUARDANDO_RETIRADA → FINALIZADO, persist the change, and reflect it in both cacambeiro and consumer views within 2 seconds
3. THE Platform SHALL visually distinguish order statuses (AGUARDANDO_ENTREGA, EM_USO, AGUARDANDO_RETIRADA, FINALIZADO) using color-coded badges
4. THE order management screen SHALL display status_aluguel, consumer name, endereco, data_inicio, dias_aluguel, and preco_final for each order
5. IF a user with tipo_perfil other than CACAMBEIRO attempts to access order management, THEN THE Platform SHALL return a 403 forbidden error
6. IF a cacambeiro attempts to transition an order status backward or skip a step in the sequence, THEN THE Platform SHALL reject the operation and display an error message indicating that only forward sequential transitions are allowed
7. IF a cacambeiro attempts to update the status of an order that is already FINALIZADO, THEN THE Platform SHALL reject the operation and display an error message indicating the order is already completed

### Requirement 12: Cacambeiro Dashboard

**User Story:** As a cacambeiro, I want to see a summary of my business metrics, so that I can understand my performance at a glance.

#### Acceptance Criteria

1. THE Platform SHALL display a dashboard screen showing total orders count (all orders regardless of status), active orders count (orders with status_aluguel IN 'AGUARDANDO_ENTREGA', 'EM_USO', 'AGUARDANDO_RETIRADA'), and total revenue (sum of preco_final for orders with status_pagamento = 'PAGO') for the authenticated cacambeiro
2. THE dashboard SHALL display the cacambeiro's nota_media (average rating) rounded to 1 decimal place, or a "Sem avaliações" indicator when no reviews exist
3. THE dashboard SHALL provide tappable shortcut elements that navigate to "Minhas Caçambas" and "Gestão de Pedidos" screens
4. WHEN the dashboard data is loading, THE Platform SHALL display a loading state with skeleton placeholders
5. IF the dashboard data request fails, THEN THE Platform SHALL display an error message and provide a retry action to re-fetch the data
6. IF a user with tipo_perfil other than CACAMBEIRO attempts to access the cacambeiro dashboard, THEN THE Platform SHALL deny access and navigate the user to their profile-appropriate home screen

### Requirement 13: Cacambeiro Financial Overview

**User Story:** As a cacambeiro, I want to view my financial transactions and revenue reports, so that I can track my earnings.

#### Acceptance Criteria

1. THE Platform SHALL display a financial screen listing only the authenticated cacambeiro's orders where status_aluguel = 'FINALIZADO' and status_pagamento = 'PAGO', showing preco_final and data_pedido for each order, sorted by data_pedido descending (most recent first)
2. THE financial screen SHALL display a total revenue summary for the current month, including the sum of preco_final and the count of completed orders
3. THE financial screen SHALL support filtering transactions by date range, with a maximum selectable range of 12 months, and SHALL default to the current month on initial load
4. WHILE financial data is loading, THE Platform SHALL display a loading indicator
5. IF financial data fails to load, THEN THE Platform SHALL display an error message indicating the failure and provide a retry option
6. IF no completed orders exist for the selected date range, THEN THE Platform SHALL display an empty state message indicating that no transactions were found for the period

### Requirement 14: Admin General Dashboard

**User Story:** As an admin, I want to see platform-wide statistics and graphs, so that I can monitor the health and growth of the marketplace.

#### Acceptance Criteria

1. THE Platform SHALL display an admin dashboard with total users count, total orders count, total revenue (sum of preco_final where status_pagamento = 'PAGO'), and active cacambeiros count (users with tipo_perfil = 'CACAMBEIRO' who have at least one dumpster with disponivel = TRUE)
2. THE admin dashboard SHALL display a graph showing orders over time, defaulting to the last 30 days with daily granularity, and allowing the admin to toggle between daily and weekly grouping
3. THE admin dashboard SHALL display a breakdown of orders by status_aluguel, showing the count for each existing status value
4. IF a user with tipo_perfil other than ADMIN attempts to access the admin dashboard, THEN THE Platform SHALL deny access and display an unauthorized message
5. IF the admin dashboard fails to load statistics from the server, THEN THE Platform SHALL display an error message indicating the data could not be retrieved and provide a retry option
6. WHEN the admin navigates to the dashboard, THE Platform SHALL display a loading indicator until all statistics and graph data have been retrieved, within a maximum of 10 seconds before showing a timeout error

### Requirement 15: Admin User Management

**User Story:** As an admin, I want to view and manage all platform users, so that I can handle support issues and maintain platform integrity.

#### Acceptance Criteria

1. IF the logged-in user does not have tipo_perfil ADMIN, THEN THE Platform SHALL deny access to the user management screen and display an unauthorized access message
2. THE Platform SHALL display a paginated user list showing all registered users with nome_completo, email, tipo_perfil, and criado_em, sorted by criado_em descending, displaying at most 20 users per page
3. THE user list SHALL support filtering by tipo_perfil (CONSUMIDOR, CACAMBEIRO, ADMIN)
4. THE user list SHALL support partial-match, case-insensitive text search by nome_completo or email with a minimum input of 3 characters before triggering the search
5. IF a search or filter returns no results, THEN THE Platform SHALL display a message indicating that no users match the criteria
6. WHEN an admin selects a user, THE Platform SHALL display the user profile showing id, nome_completo, email, tipo_perfil, documento, telefone, and criado_em, along with associated addresses and paginated order history (excluding senha_hash from all responses)

### Requirement 16: Admin Order Management

**User Story:** As an admin, I want to view and manage all platform orders, so that I can resolve disputes and monitor operations.

#### Acceptance Criteria

1. THE Platform SHALL display an order list screen showing all orders with consumidor name, cacambeiro name, status_aluguel, status_pagamento, preco_final, and data_pedido, sorted by data_pedido descending
2. THE order list SHALL support filtering by status_aluguel and status_pagamento
3. THE order list SHALL support text search by consumer or cacambeiro name with a minimum query length of 1 character
4. WHEN an admin selects an order, THE Platform SHALL display the order detail screen showing: consumidor name, cacambeiro name, status_aluguel, status_pagamento, preco_final, data_pedido, data_inicio, dias_aluguel, delivery address (logradouro, numero, bairro, cidade_estado, cep), and associated itens_aluguel (cacamba nome, quantidade, dias_aluguel, preco_diaria)
5. IF a user with tipo_perfil other than ADMIN attempts to access the admin order management screen, THEN THE Platform SHALL deny access and display an unauthorized message
6. THE order list SHALL implement pagination to handle large result sets without loading all records at once

### Requirement 17: Admin Category Management

**User Story:** As an admin, I want to manage dumpster categories (tipo_residuo), so that I can organize the marketplace catalog.

#### Acceptance Criteria

1. WHILE a user with ADMIN role is authenticated, THE Platform SHALL provide a CRUD interface for managing tipo_residuo categories, allowing the admin to create, view, edit, and delete categories
2. IF a non-ADMIN user attempts to access the category management interface, THEN THE Platform SHALL deny access and display a message indicating insufficient permissions
3. WHEN an admin creates or updates a category, THE Platform SHALL validate that the category name is unique (case-insensitive comparison), is not empty or whitespace-only, and does not exceed 100 characters
4. IF category name validation fails during creation or update, THEN THE Platform SHALL display an error message indicating the specific validation failure and preserve the admin's input
5. IF an admin attempts to delete a category that is currently associated with one or more existing dumpsters, THEN THE Platform SHALL display a warning indicating the number of associated dumpsters and prevent the deletion
6. THE Platform SHALL display the category list showing each category name and the count of dumpsters associated with that category

### Requirement 18: Profile-Based Navigation

**User Story:** As a user, I want the app navigation to match my profile type, so that I only see screens relevant to my role.

#### Acceptance Criteria

1. WHEN a CONSUMIDOR is authenticated, THE Navigation_Router SHALL display bottom tabs for: Home (Marketplace), Meus Pedidos, Carrinho, and Perfil
2. WHEN a CACAMBEIRO is authenticated, THE Navigation_Router SHALL display bottom tabs for: Dashboard, Minhas Caçambas, Pedidos, Financeiro, and Perfil
3. WHEN an ADMIN is authenticated, THE Navigation_Router SHALL display bottom tabs for: Dashboard, Usuários, Pedidos, Categorias, and Perfil
4. WHEN no user is authenticated, THE Navigation_Router SHALL display the authentication flow (Login, Register, Password Recovery) and prevent access to any tab-based screens
5. THE Navigation_Router SHALL use Stack navigation within each tab, allowing the user to navigate to detail screens and return to the tab root via back navigation
6. IF the authenticated user's tipo_perfil is missing or does not match CONSUMIDOR, CACAMBEIRO, or ADMIN, THEN THE Navigation_Router SHALL redirect the user to the authentication flow and clear the stored session
7. WHEN the user's authentication token expires or becomes invalid during active use, THE Navigation_Router SHALL redirect the user to the authentication flow within 2 seconds of detecting the invalid state

### Requirement 19: User Profile Management

**User Story:** As a user, I want to view and edit my profile information, so that I can keep my data up to date.

#### Acceptance Criteria

1. THE Platform SHALL display a profile screen showing the user's nome_completo, email, telefone, tipo_perfil, and documento, where nome_completo and telefone are presented as editable fields and email, documento, and tipo_perfil are presented as read-only fields
2. WHEN a user submits updated profile information, THE Platform SHALL validate that nome_completo is between 3 and 120 characters and telefone is between 10 and 15 digits, persist the valid changes to the backend, and display a success confirmation message
3. IF the profile update fails due to validation errors or backend unavailability, THEN THE Platform SHALL display an error message indicating the reason for failure and preserve the user's entered data in the form
4. WHEN a user activates the logout action on the profile screen, THE Platform SHALL clear the JWT_Token and navigate to the login screen
5. WHEN a CACAMBEIRO views their profile, THE Platform SHALL additionally display their business details (horario_inicio, horario_fim, raio_entrega_km, taxa_entrega) as read-only fields

### Requirement 20: Address Management

**User Story:** As a user, I want to manage my delivery addresses, so that I can quickly select them during checkout.

#### Acceptance Criteria

1. THE Platform SHALL display a list of saved addresses for the authenticated user showing cep, logradouro, numero, bairro, and cidade_estado, ordered by most recently created first, up to a maximum of 10 addresses per user
2. WHEN a user submits a new address with cep (exactly 8 digits), logradouro (1 to 200 characters), numero (1 to 20 characters), and cidade_estado (1 to 100 characters), THE Platform SHALL create the address record and associate it with the authenticated user
3. IF a user submits a new address with any required field empty or exceeding its maximum length, THEN THE Platform SHALL reject the request with an error message indicating which fields are invalid
4. WHEN a user deletes an address that is not referenced by any aluguel with status in progress, THE Platform SHALL remove the address record
5. IF a user attempts to delete an address that is referenced by an aluguel with status in progress, THEN THE Platform SHALL reject the deletion with an error message indicating the address is associated with an active order
6. IF a user attempts to access another user's addresses, THEN THE Platform SHALL return a 403 forbidden error
7. IF a user attempts to add an address and already has 10 saved addresses, THEN THE Platform SHALL reject the request with an error message indicating the maximum address limit has been reached

### Requirement 21: Reusable UI Component Library

**User Story:** As a developer, I want a consistent set of reusable UI components, so that the app maintains visual coherence and development speed.

#### Acceptance Criteria

1. THE Platform SHALL provide reusable components: Button (primary, secondary, outline, ghost variants with loading and disabled states), Card (surface container with shadow and border radius), TextInputField (with label, placeholder, error message, and secureTextEntry support), Badge (success, warning, default variants), StatusChip, Avatar (displaying user initials when no image is provided), EmptyState (with title, optional description, and optional action button), and LoadingSpinner (with optional message text)
2. THE Platform SHALL derive all component colors, spacing, border radius, and shadows exclusively from the centralized theme constants (colors.ts, spacing.ts, typography.ts, radius.ts, shadows.ts) accessed via the useTheme hook
3. THE Platform SHALL use @expo/vector-icons for all iconography within reusable components
4. THE reusable components SHALL consume theme values through the useTheme hook and be wrapped at the app root by the ThemeProvider
5. WHEN a reusable interactive component (Button, TextInputField) is rendered, THE Platform SHALL set a minimum touch target size of 44×44 density-independent pixels and provide an accessibilityLabel and accessibilityRole prop
6. IF a Button component receives the disabled prop as true, THEN THE Platform SHALL render the button with the theme gray color as background, prevent onPress invocation, and reduce opacity to 0.5

### Requirement 22: API Communication Layer

**User Story:** As a developer, I want a centralized API communication layer, so that all screens interact with the backend consistently.

#### Acceptance Criteria

1. THE Platform SHALL use Axios with a base URL read from environment configuration and automatic JWT token injection via a request interceptor that attaches the stored token in the `Authorization: Bearer <token>` header to every outgoing request
2. WHEN an API request fails with a network error (no response received), THE Platform SHALL display an error toast visible for at least 3 seconds indicating that the server is unreachable
3. WHEN an API request fails with a 401 status, THE Platform SHALL clear the stored authentication token and redirect the user to the login screen within 2 seconds
4. THE Platform SHALL provide typed service functions for each API endpoint group: auth, usuarios, cacambas, enderecos, carrinho, alugueis, avaliacoes, and cacambeiros, each returning typed response data
5. IF an API request does not receive a response within 15 seconds, THEN THE Platform SHALL abort the request and display an error toast indicating a timeout occurred
6. WHEN an API request fails with a server error (status 500–599), THE Platform SHALL display an error toast with a message indicating a server-side failure without exposing technical details to the user

### Requirement 23: Loading and Error States

**User Story:** As a user, I want clear feedback when data is loading or when errors occur, so that I understand the app's current state.

#### Acceptance Criteria

1. WHILE any API request that fetches list data is in progress, THE Platform SHALL display skeleton placeholder components in the layout where the content will appear
2. WHILE any API request that performs a user-initiated action (submit, delete, update) is in progress, THE Platform SHALL display a spinner indicator on or near the triggering control
3. WHEN an API request fails, THE Platform SHALL display a toast notification containing an error message that describes the failed operation in non-technical language (no status codes, no stack traces)
4. WHEN an error toast is displayed, THE Platform SHALL auto-dismiss it after 5 seconds
5. THE Platform SHALL support pull-to-refresh using RefreshControl on all scrollable list screens
6. WHEN a screen's API response returns zero items or an empty collection, THE Platform SHALL show an EmptyState component with a message describing what content would appear and, where a user action can produce content (e.g., "Create your first listing"), an action button that navigates to the relevant creation flow
