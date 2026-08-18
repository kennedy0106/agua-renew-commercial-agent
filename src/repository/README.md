# Repository de conversaciones

`ConversationRepository` es el puerto de persistencia usado por `ConversationEngine`.

- `InMemoryConversationRepository` es el adaptador de pruebas.
- `PostgresConversationRepository` usa consultas parametrizadas y un pool de conexiones PostgreSQL.

El motor no conoce SQL, `pg`, Docker ni un proveedor de base de datos. Para una futura migración a Neon PostgreSQL basta con proporcionar su `DATABASE_URL` al adaptador PostgreSQL.

Los registros comerciales persistidos contienen identificadores, datos de flujo y datos ya validados. No se persisten precios ni reglas comerciales: esas decisiones se mantienen en `CommercialService`.
