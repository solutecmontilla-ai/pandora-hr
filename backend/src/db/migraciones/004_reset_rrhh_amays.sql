-- Deja en cero el módulo de RRHH de Amays Group, C.A. (J501173788), a pedido
-- del usuario (2026-10-22): sin trabajadores ni nóminas, vacaciones, utilidades,
-- constancias o trayectorias. Se conservan la empresa, sus usuarios, la
-- configuración de nómina/bancaria, contabilidad y audit_log.
SET @emp := (SELECT id FROM empresas WHERE rif = 'J501173788' LIMIT 1);

DELETE FROM nomina_items          WHERE empresa_id = @emp;
DELETE FROM nominas               WHERE empresa_id = @emp;
DELETE FROM utilidades_calculadas WHERE empresa_id = @emp;
DELETE FROM nominas_utilidades    WHERE empresa_id = @emp;
DELETE FROM vacaciones_calculadas WHERE empresa_id = @emp;
DELETE FROM constancias_trabajo   WHERE empresa_id = @emp;
DELETE FROM trayectoria_laboral   WHERE empresa_id = @emp;
DELETE FROM empleado_periodos     WHERE empresa_id = @emp;
DELETE FROM empleados             WHERE empresa_id = @emp;
