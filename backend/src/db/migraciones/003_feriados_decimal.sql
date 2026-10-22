-- Domingos y feriados admite medias jornadas (0,5; 1; 1,5…)
ALTER TABLE `nomina_items` MODIFY `dias_feriados_cantidad` decimal(8,2) DEFAULT 0;
