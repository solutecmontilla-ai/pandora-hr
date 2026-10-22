-- Marca si un movimiento de trayectoria ya se reflejó en la ficha del trabajador
-- (cargo, departamento y salario). Los existentes quedan en 0 para que el
-- movimiento vigente de cada trabajador se aplique en la primera sincronización.
ALTER TABLE `trayectoria_laboral` ADD COLUMN IF NOT EXISTS `aplicado` tinyint(1) NOT NULL DEFAULT 0;
