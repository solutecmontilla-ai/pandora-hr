-- Módulo de Contabilidad (migrado desde FacturaVE): plan de cuentas FCCPV, asientos y detalles

CREATE TABLE IF NOT EXISTS `plan_cuentas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `empresa_id` int(11) NOT NULL,
  `codigo` varchar(20) NOT NULL,
  `nombre` varchar(200) NOT NULL,
  `tipo` enum('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO') NOT NULL,
  `naturaleza` enum('DEUDORA','ACREEDORA') NOT NULL,
  `nivel` int(11) DEFAULT 1 COMMENT '1=grupo, 2=subgrupo, 3=cuenta, 4=subcuenta',
  `codigo_padre` varchar(20) DEFAULT NULL,
  `acepta_movimientos` tinyint(1) DEFAULT 1,
  `activo` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_codigo_empresa` (`codigo`,`empresa_id`),
  KEY `empresa_id` (`empresa_id`),
  CONSTRAINT `plan_cuentas_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `asientos_contables` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `empresa_id` int(11) NOT NULL,
  `numero_asiento` varchar(30) NOT NULL,
  `fecha` date NOT NULL,
  `descripcion` varchar(500) NOT NULL,
  `tipo` enum('MANUAL','AUTO_NOMINA','AUTO_FACTURA','AUTO_COMPRA','AUTO_PAGO','AUTO_RETENCION','AJUSTE','APERTURA','CIERRE') DEFAULT 'MANUAL',
  `referencia_tipo` varchar(50) DEFAULT NULL,
  `referencia_id` int(11) DEFAULT NULL,
  `total_debe` decimal(18,4) DEFAULT 0.0000,
  `total_haber` decimal(18,4) DEFAULT 0.0000,
  `estado` enum('BORRADOR','CONTABILIZADO','ANULADO') DEFAULT 'BORRADOR',
  `usuario_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_empresa_fecha` (`empresa_id`,`fecha`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `asientos_contables_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
  CONSTRAINT `asientos_contables_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `asiento_detalles` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `asiento_id` bigint(20) NOT NULL,
  `empresa_id` int(11) NOT NULL,
  `cuenta_id` int(11) NOT NULL,
  `descripcion` varchar(300) DEFAULT NULL,
  `debe` decimal(18,4) DEFAULT 0.0000,
  `haber` decimal(18,4) DEFAULT 0.0000,
  PRIMARY KEY (`id`),
  KEY `asiento_id` (`asiento_id`),
  KEY `empresa_id` (`empresa_id`),
  KEY `cuenta_id` (`cuenta_id`),
  CONSTRAINT `asiento_detalles_ibfk_1` FOREIGN KEY (`asiento_id`) REFERENCES `asientos_contables` (`id`) ON DELETE CASCADE,
  CONSTRAINT `asiento_detalles_ibfk_2` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
  CONSTRAINT `asiento_detalles_ibfk_3` FOREIGN KEY (`cuenta_id`) REFERENCES `plan_cuentas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `plan_cuentas_plantilla` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(20) NOT NULL,
  `nombre` varchar(200) NOT NULL,
  `tipo` enum('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO') NOT NULL,
  `naturaleza` enum('DEUDORA','ACREEDORA') NOT NULL,
  `nivel` int(11) DEFAULT 1,
  `codigo_padre` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Plantilla FCCPV
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (1,'1','ACTIVOS','ACTIVO','DEUDORA',1,NULL);
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (2,'1.1','ACTIVO CIRCULANTE','ACTIVO','DEUDORA',2,'1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (3,'1.1.1','Caja y Bancos','ACTIVO','DEUDORA',3,'1.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (4,'1.1.1.01','Caja Chica','ACTIVO','DEUDORA',4,'1.1.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (5,'1.1.1.02','Banco Provincial','ACTIVO','DEUDORA',4,'1.1.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (6,'1.1.1.03','Banco de Venezuela','ACTIVO','DEUDORA',4,'1.1.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (7,'1.1.2','Cuentas por Cobrar','ACTIVO','DEUDORA',3,'1.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (8,'1.1.2.01','Clientes','ACTIVO','DEUDORA',4,'1.1.2');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (9,'1.1.2.02','Anticipos a Proveedores','ACTIVO','DEUDORA',4,'1.1.2');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (10,'1.1.3','IVA Crédito Fiscal','ACTIVO','DEUDORA',3,'1.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (11,'1.1.3.01','IVA Crédito Fiscal 16%','ACTIVO','DEUDORA',4,'1.1.3');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (12,'1.1.3.02','IVA Crédito Fiscal 8%','ACTIVO','DEUDORA',4,'1.1.3');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (13,'1.1.4','Retenciones IVA por Cobrar','ACTIVO','DEUDORA',3,'1.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (14,'1.1.5','Inventario de Mercancías','ACTIVO','DEUDORA',3,'1.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (15,'1.2','ACTIVO FIJO','ACTIVO','DEUDORA',2,'1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (16,'1.2.1','Mobiliario y Equipo','ACTIVO','DEUDORA',3,'1.2');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (17,'1.2.2','Equipo de Computación','ACTIVO','DEUDORA',3,'1.2');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (18,'1.2.3','Depreciación Acumulada','ACTIVO','ACREEDORA',3,'1.2');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (19,'2','PASIVOS','PASIVO','ACREEDORA',1,NULL);
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (20,'2.1','PASIVO CIRCULANTE','PASIVO','ACREEDORA',2,'2');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (21,'2.1.1','Cuentas por Pagar','PASIVO','ACREEDORA',3,'2.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (22,'2.1.1.01','Proveedores','PASIVO','ACREEDORA',4,'2.1.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (23,'2.1.2','IVA Débito Fiscal','PASIVO','ACREEDORA',3,'2.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (24,'2.1.2.01','IVA Débito Fiscal 16%','PASIVO','ACREEDORA',4,'2.1.2');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (25,'2.1.2.02','IVA Débito Fiscal 8%','PASIVO','ACREEDORA',4,'2.1.2');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (26,'2.1.3','Retenciones IVA por Pagar','PASIVO','ACREEDORA',3,'2.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (27,'2.1.4','Retenciones ISLR por Pagar','PASIVO','ACREEDORA',3,'2.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (28,'2.1.5','Sueldos y Salarios por Pagar','PASIVO','ACREEDORA',3,'2.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (29,'2.2','PASIVO A LARGO PLAZO','PASIVO','ACREEDORA',2,'2');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (30,'3','PATRIMONIO','PATRIMONIO','ACREEDORA',1,NULL);
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (31,'3.1','Capital Social','PATRIMONIO','ACREEDORA',2,'3');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (32,'3.2','Utilidades Retenidas','PATRIMONIO','ACREEDORA',2,'3');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (33,'3.3','Utilidad del Ejercicio','PATRIMONIO','ACREEDORA',2,'3');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (34,'4','INGRESOS','INGRESO','ACREEDORA',1,NULL);
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (35,'4.1','Ingresos por Ventas','INGRESO','ACREEDORA',2,'4');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (36,'4.1.1','Ventas de Servicios','INGRESO','ACREEDORA',3,'4.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (37,'4.1.2','Ventas de Productos','INGRESO','ACREEDORA',3,'4.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (38,'4.2','Otros Ingresos','INGRESO','ACREEDORA',2,'4');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (39,'5','COSTOS','COSTO','DEUDORA',1,NULL);
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (40,'5.1','Costo de Ventas','COSTO','DEUDORA',2,'5');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (41,'5.1.1','Costo de Mercancías Vendidas','COSTO','DEUDORA',3,'5.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (42,'6','GASTOS','GASTO','DEUDORA',1,NULL);
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (43,'6.1','GASTOS DE OPERACIÓN','GASTO','DEUDORA',2,'6');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (44,'6.1.1','Sueldos y Salarios','GASTO','DEUDORA',3,'6.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (45,'6.1.2','Alquiler','GASTO','DEUDORA',3,'6.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (46,'6.1.3','Servicios Públicos','GASTO','DEUDORA',3,'6.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (47,'6.1.4','Depreciación','GASTO','DEUDORA',3,'6.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (48,'6.1.5','Papelería y Útiles','GASTO','DEUDORA',3,'6.1');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (49,'6.2','GASTOS FINANCIEROS','GASTO','DEUDORA',2,'6');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (50,'6.2.1','Comisiones Bancarias','GASTO','DEUDORA',3,'6.2');
INSERT IGNORE INTO `plan_cuentas_plantilla` VALUES (51,'6.3','GASTOS ADMINISTRATIVOS','GASTO','DEUDORA',2,'6');
