-- Secuencia independiente para numeración comercial. Evita mezclar la
-- numeración visible de cotizaciones con la clave interna de auditoría.
CREATE SEQUENCE IF NOT EXISTS crm_quote_number_seq START WITH 1 INCREMENT BY 1;
