-- ============================================================
-- FACTURA VE SaaS - Schema Multi-Tenant
-- Cumplimiento: PA SNAT/2011/0071, SNAT/2024/000102, SNAT/2024/000121
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS facturaVE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE facturaVE;

-- ============================================================
-- SUPERADMIN: Gestión SaaS
-- ============================================================

CREATE TABLE planes_saas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(50) NOT NULL,
  slug VARCHAR(30) NOT NULL UNIQUE,
  max_facturas_mes INT DEFAULT 100 COMMENT '-1 = ilimitado',
  max_usuarios INT DEFAULT 3,
  tiene_retenciones TINYINT(1) DEFAULT 0,
  tiene_guias TINYINT(1) DEFAULT 0,
  tiene_api TINYINT(1) DEFAULT 0,
  tiene_multiusuario TINYINT(1) DEFAULT 0,
  precio_usd DECIMAL(10,2) DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO planes_saas (nombre, slug, max_facturas_mes, max_usuarios, tiene_retenciones, tiene_guias, tiene_api, tiene_multiusuario, precio_usd) VALUES
('Básico',   'basico',   100,  2, 0, 0, 0, 0,  9.99),
('Pro',      'pro',       -1,  5, 1, 1, 0, 1, 24.99),
('Empresa',  'empresa',   -1, 20, 1, 1, 1, 1, 59.99);

-- ============================================================
-- EMPRESAS (Tenants)
-- ============================================================

CREATE TABLE empresas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT NOT NULL DEFAULT 1,
  -- Datos fiscales SENIAT obligatorios
  rif VARCHAR(15) NOT NULL UNIQUE COMMENT 'J-12345678-9',
  razon_social VARCHAR(200) NOT NULL,
  nombre_comercial VARCHAR(200),
  tipo_contribuyente ENUM('ORDINARIO','ESPECIAL','FORMAL') DEFAULT 'ORDINARIO',
  -- Dirección fiscal
  direccion_fiscal TEXT NOT NULL,
  municipio VARCHAR(100),
  estado VARCHAR(100),
  pais VARCHAR(60) DEFAULT 'Venezuela',
  -- Contacto
  telefono VARCHAR(20),
  email VARCHAR(150),
  web VARCHAR(200),
  -- Configuración fiscal
  agente_retencion_iva TINYINT(1) DEFAULT 0,
  agente_retencion_islr TINYINT(1) DEFAULT 0,
  porcentaje_iva_general DECIMAL(5,2) DEFAULT 16.00,
  porcentaje_iva_reducido DECIMAL(5,2) DEFAULT 8.00,
  -- Certificado SUSCERTE para firma digital
  cert_p12_path VARCHAR(500),
  cert_password_encrypted VARCHAR(500),
  cert_vencimiento DATE,
  -- Numeración SENIAT
  numero_control_inicio BIGINT DEFAULT 1,
  numero_control_actual BIGINT DEFAULT 0,
  serie_factura VARCHAR(10) DEFAULT '00-',
  -- Homologación SENIAT
  numero_autorizacion_seniat VARCHAR(100),
  fecha_autorizacion DATE,
  -- SaaS
  subdominio VARCHAR(50) UNIQUE,
  activo TINYINT(1) DEFAULT 1,
  fecha_vencimiento_plan DATE,
  -- Metadatos
  logo_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES planes_saas(id)
);

-- ============================================================
-- USUARIOS (por empresa)
-- ============================================================

CREATE TABLE usuarios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('SUPERADMIN','ADMIN','CONTADOR','VENDEDOR','LECTURA') DEFAULT 'LECTURA',
  activo TINYINT(1) DEFAULT 1,
  ultimo_login TIMESTAMP NULL,
  token_reset VARCHAR(255),
  token_reset_exp TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_email_empresa (email, empresa_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- Usuario superadmin del sistema
INSERT INTO empresas (rif, razon_social, direccion_fiscal, email, activo) VALUES
('V-00000001-1','AmaysGroup SaaS','Caracas, Venezuela','admin@amaysgroup.com', 1);

INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol) VALUES
(1, 'Superadmin', 'admin@amaysgroup.com', '$2b$12$CHANGE_THIS_HASH', 'SUPERADMIN');

-- ============================================================
-- CLIENTES (por empresa)
-- ============================================================

CREATE TABLE clientes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  -- Datos fiscales obligatorios PA 0071
  rif VARCHAR(15) NOT NULL COMMENT 'J/V/E/G/P-XXXXXXXX-X',
  tipo_rif ENUM('J','V','E','G','P') DEFAULT 'J',
  razon_social VARCHAR(200) NOT NULL,
  nombre_comercial VARCHAR(200),
  tipo_persona ENUM('JURIDICA','NATURAL','EXTRANJERO') DEFAULT 'JURIDICA',
  -- Dirección
  direccion VARCHAR(500),
  municipio VARCHAR(100),
  estado VARCHAR(100),
  pais VARCHAR(60) DEFAULT 'Venezuela',
  -- Contacto
  telefono VARCHAR(30),
  email VARCHAR(150),
  -- Fiscal
  agente_retencion_iva TINYINT(1) DEFAULT 0,
  agente_retencion_islr TINYINT(1) DEFAULT 0,
  porcentaje_retencion_islr DECIMAL(5,2) DEFAULT 0,
  -- Control
  activo TINYINT(1) DEFAULT 1,
  notas TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rif_empresa (rif, empresa_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- ============================================================
-- PRODUCTOS / SERVICIOS (por empresa)
-- ============================================================

CREATE TABLE productos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  codigo VARCHAR(50),
  nombre VARCHAR(300) NOT NULL,
  descripcion TEXT,
  tipo ENUM('PRODUCTO','SERVICIO') DEFAULT 'SERVICIO',
  unidad VARCHAR(50) DEFAULT 'Unidad',
  -- Precios
  precio_unitario DECIMAL(18,8) DEFAULT 0,
  precio_usd DECIMAL(18,8) DEFAULT 0,
  -- IVA según PA 0071 Art. 14
  tipo_iva ENUM('GENERAL','REDUCIDO','EXENTO','NO_SUJETO') DEFAULT 'GENERAL',
  -- Inventario (si aplica)
  controla_inventario TINYINT(1) DEFAULT 0,
  stock_actual DECIMAL(18,4) DEFAULT 0,
  stock_minimo DECIMAL(18,4) DEFAULT 0,
  -- Control
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- ============================================================
-- NUMERACIÓN DE DOCUMENTOS (por empresa)
-- ============================================================

CREATE TABLE numeracion_documentos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  tipo_documento ENUM('FACTURA','NOTA_CREDITO','NOTA_DEBITO','GUIA_DESPACHO','RETENCION_IVA','RETENCION_ISLR') NOT NULL,
  numero_actual BIGINT DEFAULT 0,
  numero_control_actual BIGINT DEFAULT 0,
  prefijo VARCHAR(20) DEFAULT '',
  UNIQUE KEY uk_empresa_tipo (empresa_id, tipo_documento),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- ============================================================
-- FACTURAS (cumple PA 0071 Art. 14 + PA 0102)
-- ============================================================

CREATE TABLE facturas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  cliente_id INT NOT NULL,
  -- Numeración SENIAT (obligatorio)
  numero_factura VARCHAR(50) NOT NULL COMMENT 'Secuencial por empresa',
  numero_control VARCHAR(50) NOT NULL COMMENT 'Asignado por SENIAT/imprenta digital',
  serie VARCHAR(20),
  tipo_documento ENUM('FACTURA','NOTA_CREDITO','NOTA_DEBITO') DEFAULT 'FACTURA',
  -- Documentos relacionados
  factura_original_id INT NULL COMMENT 'Para NC/ND',
  -- Fechas (obligatorio)
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE,
  -- Receptor (snapshot para inmutabilidad)
  receptor_rif VARCHAR(15) NOT NULL,
  receptor_razon_social VARCHAR(200) NOT NULL,
  receptor_direccion TEXT,
  -- Monedas (Venezuela usa VES y USD)
  moneda ENUM('VES','USD','EUR') DEFAULT 'USD',
  tasa_cambio_bcv DECIMAL(18,6) DEFAULT 1 COMMENT 'Tasa BCV del día',
  -- Totales (obligatorio PA 0071)
  subtotal DECIMAL(18,4) DEFAULT 0,
  total_exento DECIMAL(18,4) DEFAULT 0,
  total_no_sujeto DECIMAL(18,4) DEFAULT 0,
  base_imponible_general DECIMAL(18,4) DEFAULT 0,
  base_imponible_reducido DECIMAL(18,4) DEFAULT 0,
  iva_general DECIMAL(18,4) DEFAULT 0,
  iva_reducido DECIMAL(18,4) DEFAULT 0,
  total_iva DECIMAL(18,4) DEFAULT 0,
  total_factura DECIMAL(18,4) DEFAULT 0,
  -- Retenciones
  retencion_iva DECIMAL(18,4) DEFAULT 0,
  retencion_islr DECIMAL(18,4) DEFAULT 0,
  -- Estado del documento
  estado ENUM('BORRADOR','EMITIDA','ANULADA','RECHAZADA_SENIAT') DEFAULT 'BORRADOR',
  -- Integración SENIAT
  xml_generado TEXT COMMENT 'XML UBL 2.1',
  xml_firmado TEXT COMMENT 'XML con firma SUSCERTE',
  respuesta_seniat JSON COMMENT 'Respuesta WS SENIAT',
  numero_control_seniat VARCHAR(100),
  fecha_envio_seniat TIMESTAMP NULL,
  -- PDF
  pdf_path VARCHAR(500),
  qr_code TEXT COMMENT 'Contenido del código QR SENIAT',
  -- Control de versión (inmutabilidad PA 121)
  hash_documento VARCHAR(64) COMMENT 'SHA-256 del XML firmado',
  -- Otros
  observaciones TEXT,
  condicion_pago VARCHAR(100) DEFAULT 'Contado',
  usuario_id INT NOT NULL COMMENT 'Quién emitió',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_numero_empresa (numero_factura, empresa_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (factura_original_id) REFERENCES facturas(id)
);

-- ============================================================
-- ITEMS DE FACTURA
-- ============================================================

CREATE TABLE factura_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  factura_id INT NOT NULL,
  empresa_id INT NOT NULL,
  producto_id INT NULL,
  -- Descripción (snapshot)
  descripcion VARCHAR(500) NOT NULL,
  unidad VARCHAR(50) DEFAULT 'Unidad',
  -- Cantidades y precios
  cantidad DECIMAL(18,4) NOT NULL,
  precio_unitario DECIMAL(18,8) NOT NULL,
  descuento_pct DECIMAL(5,2) DEFAULT 0,
  descuento_monto DECIMAL(18,4) DEFAULT 0,
  subtotal DECIMAL(18,4) NOT NULL,
  -- IVA por ítem (PA 0071 Art. 14)
  tipo_iva ENUM('GENERAL','REDUCIDO','EXENTO','NO_SUJETO') DEFAULT 'GENERAL',
  alicuota_iva DECIMAL(5,2) DEFAULT 16.00,
  monto_iva DECIMAL(18,4) DEFAULT 0,
  total_item DECIMAL(18,4) NOT NULL,
  orden INT DEFAULT 0,
  FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- ============================================================
-- RETENCIONES IVA (PA SNAT/2005/0056)
-- ============================================================

CREATE TABLE retenciones_iva (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  factura_id INT NOT NULL,
  -- Comprobante
  numero_comprobante VARCHAR(50) NOT NULL,
  fecha DATE NOT NULL,
  -- Datos del retenedor
  retenedor_rif VARCHAR(15) NOT NULL,
  retenedor_razon_social VARCHAR(200) NOT NULL,
  -- Cálculo
  base_imponible DECIMAL(18,4) NOT NULL,
  porcentaje_retencion DECIMAL(5,2) NOT NULL DEFAULT 75,
  monto_retenido DECIMAL(18,4) NOT NULL,
  -- Estado
  estado ENUM('EMITIDA','ANULADA') DEFAULT 'EMITIDA',
  pdf_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (factura_id) REFERENCES facturas(id)
);

-- ============================================================
-- RETENCIONES ISLR
-- ============================================================

CREATE TABLE retenciones_islr (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  factura_id INT NOT NULL,
  numero_comprobante VARCHAR(50) NOT NULL,
  fecha DATE NOT NULL,
  concepto VARCHAR(200) NOT NULL,
  base_imponible DECIMAL(18,4) NOT NULL,
  porcentaje_retencion DECIMAL(5,2) NOT NULL,
  monto_retenido DECIMAL(18,4) NOT NULL,
  estado ENUM('EMITIDA','ANULADA') DEFAULT 'EMITIDA',
  pdf_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (factura_id) REFERENCES facturas(id)
);

-- ============================================================
-- GUÍAS DE DESPACHO / ÓRDENES DE ENTREGA
-- ============================================================

CREATE TABLE guias_despacho (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  cliente_id INT NOT NULL,
  factura_id INT NULL,
  numero_guia VARCHAR(50) NOT NULL,
  numero_control VARCHAR(50) NOT NULL,
  fecha DATE NOT NULL,
  -- Destinatario
  destinatario_rif VARCHAR(15),
  destinatario_razon VARCHAR(200),
  direccion_entrega TEXT,
  -- Transporte
  transportista VARCHAR(200),
  placa VARCHAR(20),
  conductor VARCHAR(200),
  -- Estado
  estado ENUM('BORRADOR','EMITIDA','ENTREGADA','ANULADA') DEFAULT 'BORRADOR',
  pdf_path VARCHAR(500),
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (factura_id) REFERENCES facturas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE guia_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  guia_id INT NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  cantidad DECIMAL(18,4) NOT NULL,
  unidad VARCHAR(50),
  peso_kg DECIMAL(10,3),
  FOREIGN KEY (guia_id) REFERENCES guias_despacho(id) ON DELETE CASCADE
);

-- ============================================================
-- LIBRO DE VENTAS (automático, por período)
-- ============================================================

CREATE TABLE libro_ventas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  factura_id INT NOT NULL,
  periodo VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  fecha DATE NOT NULL,
  numero_documento VARCHAR(50),
  numero_control VARCHAR(50),
  tipo_operacion ENUM('VENTA','DEBITO','CREDITO','ANULACION') DEFAULT 'VENTA',
  rif_cliente VARCHAR(15),
  razon_social_cliente VARCHAR(200),
  -- Montos
  ventas_internas_exentas DECIMAL(18,4) DEFAULT 0,
  ventas_no_gravadas DECIMAL(18,4) DEFAULT 0,
  base_imponible_general DECIMAL(18,4) DEFAULT 0,
  base_imponible_reducido DECIMAL(18,4) DEFAULT 0,
  iva_general DECIMAL(18,4) DEFAULT 0,
  iva_reducido DECIMAL(18,4) DEFAULT 0,
  total_iva DECIMAL(18,4) DEFAULT 0,
  total_ventas DECIMAL(18,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_empresa_periodo (empresa_id, periodo),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (factura_id) REFERENCES facturas(id)
);

-- ============================================================
-- LIBRO DE COMPRAS
-- ============================================================

CREATE TABLE libro_compras (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  fecha DATE NOT NULL,
  numero_documento VARCHAR(50),
  numero_control VARCHAR(50),
  tipo_operacion ENUM('COMPRA','DEBITO','CREDITO','ANULACION') DEFAULT 'COMPRA',
  rif_proveedor VARCHAR(15) NOT NULL,
  razon_social_proveedor VARCHAR(200) NOT NULL,
  -- Montos
  compras_exentas DECIMAL(18,4) DEFAULT 0,
  compras_no_gravadas DECIMAL(18,4) DEFAULT 0,
  base_imponible_general DECIMAL(18,4) DEFAULT 0,
  base_imponible_reducido DECIMAL(18,4) DEFAULT 0,
  credito_fiscal_general DECIMAL(18,4) DEFAULT 0,
  credito_fiscal_reducido DECIMAL(18,4) DEFAULT 0,
  total_credito_fiscal DECIMAL(18,4) DEFAULT 0,
  total_compras DECIMAL(18,4) DEFAULT 0,
  -- Soporte
  soporte_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_empresa_periodo (empresa_id, periodo),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- ============================================================
-- TASA BCV (control de cambio diario)
-- ============================================================

CREATE TABLE tasas_bcv (
  id INT PRIMARY KEY AUTO_INCREMENT,
  fecha DATE NOT NULL UNIQUE,
  tasa_usd DECIMAL(18,6) NOT NULL COMMENT 'Bs/USD',
  tasa_eur DECIMAL(18,6),
  fuente VARCHAR(50) DEFAULT 'BCV',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CUENTAS POR COBRAR
-- ============================================================

CREATE TABLE cxc (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  factura_id INT NOT NULL,
  cliente_id INT NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  monto_total DECIMAL(18,4) NOT NULL,
  monto_pagado DECIMAL(18,4) DEFAULT 0,
  monto_pendiente DECIMAL(18,4) GENERATED ALWAYS AS (monto_total - monto_pagado) STORED,
  estado ENUM('PENDIENTE','PARCIAL','PAGADA','VENCIDA') DEFAULT 'PENDIENTE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (factura_id) REFERENCES facturas(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE TABLE cxc_pagos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  cxc_id INT NOT NULL,
  empresa_id INT NOT NULL,
  fecha DATE NOT NULL,
  monto DECIMAL(18,4) NOT NULL,
  metodo_pago ENUM('EFECTIVO','TRANSFERENCIA','PAGO_MOVIL','ZELLE','BINANCE','OTRO') DEFAULT 'TRANSFERENCIA',
  referencia VARCHAR(100),
  banco VARCHAR(100),
  notas TEXT,
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cxc_id) REFERENCES cxc(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- ============================================================
-- AUDIT LOG INMUTABLE (PA 121 obligatorio)
-- Registra IP + MAC + usuario + timestamp en cada operación
-- ============================================================

CREATE TABLE audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT,
  usuario_id INT,
  accion VARCHAR(100) NOT NULL,
  tabla_afectada VARCHAR(100),
  registro_id INT,
  datos_anteriores JSON,
  datos_nuevos JSON,
  ip_address VARCHAR(45) NOT NULL,
  mac_address VARCHAR(17),
  user_agent TEXT,
  session_id VARCHAR(100),
  resultado ENUM('OK','ERROR') DEFAULT 'OK',
  mensaje_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_empresa_fecha (empresa_id, created_at),
  INDEX idx_accion (accion),
  INDEX idx_tabla_registro (tabla_afectada, registro_id)
) COMMENT 'Tabla inmutable - prohibido UPDATE/DELETE por PA 121';

-- ============================================================
-- ACCESO FISCALIZACIÓN SENIAT (PA 121 Art. 8)
-- ============================================================

CREATE TABLE acceso_fiscalizacion (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  clave_acceso VARCHAR(100) NOT NULL COMMENT 'Proporcionada al SENIAT',
  permisos JSON DEFAULT '{"solo_lectura": true}',
  activo TINYINT(1) DEFAULT 1,
  ultimo_acceso TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- ============================================================
-- SUSCRIPCIONES SaaS (historial de pagos)
-- ============================================================

CREATE TABLE suscripciones (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  plan_id INT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  monto_usd DECIMAL(10,2) NOT NULL,
  metodo_pago ENUM('STRIPE','BINANCE','ZELLE','TRANSFERENCIA','GRATIS') DEFAULT 'ZELLE',
  referencia_pago VARCHAR(200),
  estado ENUM('ACTIVA','VENCIDA','CANCELADA') DEFAULT 'ACTIVA',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (plan_id) REFERENCES planes_saas(id)
);

-- ============================================================
-- PLANES: actualizar con niveles de soporte
-- ============================================================
-- Limpiar y recrear con la diferencia por soporte
SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM planes_saas;
ALTER TABLE planes_saas ADD COLUMN nivel_soporte ENUM('NINGUNO','EMAIL','PRIORITARIO','DEDICADO') DEFAULT 'EMAIL' AFTER precio_usd;
ALTER TABLE planes_saas ADD COLUMN sla_horas INT DEFAULT NULL COMMENT 'SLA de respuesta en horas';
ALTER TABLE planes_saas ADD COLUMN soporte_telefono TINYINT(1) DEFAULT 0;
ALTER TABLE planes_saas ADD COLUMN soporte_whatsapp TINYINT(1) DEFAULT 0;
ALTER TABLE planes_saas ADD COLUMN tiene_inventario TINYINT(1) DEFAULT 0;
ALTER TABLE planes_saas ADD COLUMN tiene_compras TINYINT(1) DEFAULT 0;
ALTER TABLE planes_saas ADD COLUMN tiene_contabilidad TINYINT(1) DEFAULT 0;

INSERT INTO planes_saas
  (nombre, slug, max_facturas_mes, max_usuarios,
   tiene_retenciones, tiene_guias, tiene_api, tiene_multiusuario,
   tiene_inventario, tiene_compras, tiene_contabilidad,
   nivel_soporte, sla_horas, soporte_telefono, soporte_whatsapp,
   precio_usd, activo)
VALUES
  ('Básico',   'basico',  100,  2, 0, 0, 0, 0, 0, 0, 0, 'EMAIL',      72, 0, 0,  9.99, 1),
  ('Pro',      'pro',      -1,  5, 1, 1, 0, 1, 1, 1, 0, 'PRIORITARIO', 24, 0, 1, 24.99, 1),
  ('Empresa',  'empresa',  -1, 20, 1, 1, 1, 1, 1, 1, 1, 'DEDICADO',     4, 1, 1, 59.99, 1);

-- ============================================================
-- INVENTARIO / ALMACÉN
-- ============================================================

CREATE TABLE IF NOT EXISTS almacenes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  ubicacion VARCHAR(300),
  responsable VARCHAR(150),
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventario_movimientos (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  producto_id INT NOT NULL,
  almacen_id INT,
  tipo ENUM('ENTRADA','SALIDA','AJUSTE','DEVOLUCION','TRASLADO') NOT NULL,
  cantidad DECIMAL(18,4) NOT NULL,
  costo_unitario DECIMAL(18,8) DEFAULT 0,
  motivo VARCHAR(200),
  referencia_tipo VARCHAR(50) COMMENT 'factura, compra, ajuste...',
  referencia_id INT,
  stock_anterior DECIMAL(18,4),
  stock_nuevo DECIMAL(18,4),
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_empresa_producto (empresa_id, producto_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- ============================================================
-- COMPRAS Y CUENTAS POR PAGAR
-- ============================================================

CREATE TABLE IF NOT EXISTS proveedores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  rif VARCHAR(15) NOT NULL,
  tipo_rif ENUM('J','V','E','G','P') DEFAULT 'J',
  razon_social VARCHAR(200) NOT NULL,
  nombre_comercial VARCHAR(200),
  direccion VARCHAR(500),
  municipio VARCHAR(100),
  estado VARCHAR(100),
  telefono VARCHAR(30),
  email VARCHAR(150),
  agente_retencion_iva TINYINT(1) DEFAULT 0,
  cuenta_bancaria VARCHAR(30),
  banco VARCHAR(100),
  activo TINYINT(1) DEFAULT 1,
  notas TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rif_empresa (rif, empresa_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ordenes_compra (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  proveedor_id INT NOT NULL,
  numero_orden VARCHAR(50) NOT NULL,
  fecha DATE NOT NULL,
  fecha_entrega_esperada DATE,
  moneda ENUM('VES','USD','EUR') DEFAULT 'USD',
  tasa_cambio_bcv DECIMAL(18,6) DEFAULT 1,
  subtotal DECIMAL(18,4) DEFAULT 0,
  total_iva DECIMAL(18,4) DEFAULT 0,
  total DECIMAL(18,4) DEFAULT 0,
  estado ENUM('BORRADOR','ENVIADA','RECIBIDA_PARCIAL','COMPLETADA','ANULADA') DEFAULT 'BORRADOR',
  observaciones TEXT,
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_orden_empresa (numero_orden, empresa_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS orden_compra_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  orden_id INT NOT NULL,
  empresa_id INT NOT NULL,
  producto_id INT,
  descripcion VARCHAR(500) NOT NULL,
  unidad VARCHAR(50),
  cantidad_pedida DECIMAL(18,4) NOT NULL,
  cantidad_recibida DECIMAL(18,4) DEFAULT 0,
  precio_unitario DECIMAL(18,8) NOT NULL,
  tipo_iva ENUM('GENERAL','REDUCIDO','EXENTO','NO_SUJETO') DEFAULT 'GENERAL',
  alicuota_iva DECIMAL(5,2) DEFAULT 16,
  monto_iva DECIMAL(18,4) DEFAULT 0,
  subtotal DECIMAL(18,4) NOT NULL,
  total_item DECIMAL(18,4) NOT NULL,
  FOREIGN KEY (orden_id) REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  proveedor_id INT NOT NULL,
  orden_compra_id INT,
  numero_factura_proveedor VARCHAR(100),
  fecha DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  monto_total DECIMAL(18,4) NOT NULL,
  monto_pagado DECIMAL(18,4) DEFAULT 0,
  monto_pendiente DECIMAL(18,4) GENERATED ALWAYS AS (monto_total - monto_pagado) STORED,
  estado ENUM('PENDIENTE','PARCIAL','PAGADA','VENCIDA') DEFAULT 'PENDIENTE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  FOREIGN KEY (orden_compra_id) REFERENCES ordenes_compra(id)
);

CREATE TABLE IF NOT EXISTS cxp_pagos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  cxp_id INT NOT NULL,
  empresa_id INT NOT NULL,
  fecha DATE NOT NULL,
  monto DECIMAL(18,4) NOT NULL,
  metodo_pago ENUM('EFECTIVO','TRANSFERENCIA','PAGO_MOVIL','ZELLE','CHEQUE','OTRO') DEFAULT 'TRANSFERENCIA',
  referencia VARCHAR(100),
  banco VARCHAR(100),
  notas TEXT,
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cxp_id) REFERENCES cuentas_por_pagar(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- ============================================================
-- CONTABILIDAD BÁSICA
-- Plan de Cuentas Único (PUC) Venezuela
-- ============================================================

CREATE TABLE IF NOT EXISTS plan_cuentas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  tipo ENUM('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO') NOT NULL,
  naturaleza ENUM('DEUDORA','ACREEDORA') NOT NULL,
  nivel INT DEFAULT 1 COMMENT '1=grupo, 2=subgrupo, 3=cuenta, 4=subcuenta',
  codigo_padre VARCHAR(20),
  acepta_movimientos TINYINT(1) DEFAULT 1,
  activo TINYINT(1) DEFAULT 1,
  UNIQUE KEY uk_codigo_empresa (codigo, empresa_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asientos_contables (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  numero_asiento VARCHAR(30) NOT NULL,
  fecha DATE NOT NULL,
  descripcion VARCHAR(500) NOT NULL,
  tipo ENUM('MANUAL','AUTO_FACTURA','AUTO_COMPRA','AUTO_PAGO','AUTO_RETENCION','AJUSTE','APERTURA','CIERRE') DEFAULT 'MANUAL',
  referencia_tipo VARCHAR(50),
  referencia_id INT,
  total_debe DECIMAL(18,4) DEFAULT 0,
  total_haber DECIMAL(18,4) DEFAULT 0,
  estado ENUM('BORRADOR','CONTABILIZADO','ANULADO') DEFAULT 'BORRADOR',
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_empresa_fecha (empresa_id, fecha),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS asiento_detalles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  asiento_id BIGINT NOT NULL,
  empresa_id INT NOT NULL,
  cuenta_id INT NOT NULL,
  descripcion VARCHAR(300),
  debe DECIMAL(18,4) DEFAULT 0,
  haber DECIMAL(18,4) DEFAULT 0,
  FOREIGN KEY (asiento_id) REFERENCES asientos_contables(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (cuenta_id) REFERENCES plan_cuentas(id)
);

-- Índice de plan de cuentas venezolano estándar (FCCPV)
-- Se inserta por empresa en el seed, aquí la plantilla base:
CREATE TABLE IF NOT EXISTS plan_cuentas_plantilla (
  id INT PRIMARY KEY AUTO_INCREMENT,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(200) NOT NULL,
  tipo ENUM('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO') NOT NULL,
  naturaleza ENUM('DEUDORA','ACREEDORA') NOT NULL,
  nivel INT DEFAULT 1,
  codigo_padre VARCHAR(20)
);

INSERT IGNORE INTO plan_cuentas_plantilla (codigo, nombre, tipo, naturaleza, nivel, codigo_padre) VALUES
-- ACTIVOS
('1','ACTIVOS','ACTIVO','DEUDORA',1,NULL),
('1.1','ACTIVO CIRCULANTE','ACTIVO','DEUDORA',2,'1'),
('1.1.1','Caja y Bancos','ACTIVO','DEUDORA',3,'1.1'),
('1.1.1.01','Caja Chica','ACTIVO','DEUDORA',4,'1.1.1'),
('1.1.1.02','Banco Provincial','ACTIVO','DEUDORA',4,'1.1.1'),
('1.1.1.03','Banco de Venezuela','ACTIVO','DEUDORA',4,'1.1.1'),
('1.1.2','Cuentas por Cobrar','ACTIVO','DEUDORA',3,'1.1'),
('1.1.2.01','Clientes','ACTIVO','DEUDORA',4,'1.1.2'),
('1.1.2.02','Anticipos a Proveedores','ACTIVO','DEUDORA',4,'1.1.2'),
('1.1.3','IVA Crédito Fiscal','ACTIVO','DEUDORA',3,'1.1'),
('1.1.3.01','IVA Crédito Fiscal 16%','ACTIVO','DEUDORA',4,'1.1.3'),
('1.1.3.02','IVA Crédito Fiscal 8%','ACTIVO','DEUDORA',4,'1.1.3'),
('1.1.4','Retenciones IVA por Cobrar','ACTIVO','DEUDORA',3,'1.1'),
('1.1.5','Inventario de Mercancías','ACTIVO','DEUDORA',3,'1.1'),
('1.2','ACTIVO FIJO','ACTIVO','DEUDORA',2,'1'),
('1.2.1','Mobiliario y Equipo','ACTIVO','DEUDORA',3,'1.2'),
('1.2.2','Equipo de Computación','ACTIVO','DEUDORA',3,'1.2'),
('1.2.3','Depreciación Acumulada','ACTIVO','ACREEDORA',3,'1.2'),
-- PASIVOS
('2','PASIVOS','PASIVO','ACREEDORA',1,NULL),
('2.1','PASIVO CIRCULANTE','PASIVO','ACREEDORA',2,'2'),
('2.1.1','Cuentas por Pagar','PASIVO','ACREEDORA',3,'2.1'),
('2.1.1.01','Proveedores','PASIVO','ACREEDORA',4,'2.1.1'),
('2.1.2','IVA Débito Fiscal','PASIVO','ACREEDORA',3,'2.1'),
('2.1.2.01','IVA Débito Fiscal 16%','PASIVO','ACREEDORA',4,'2.1.2'),
('2.1.2.02','IVA Débito Fiscal 8%','PASIVO','ACREEDORA',4,'2.1.2'),
('2.1.3','Retenciones IVA por Pagar','PASIVO','ACREEDORA',3,'2.1'),
('2.1.4','Retenciones ISLR por Pagar','PASIVO','ACREEDORA',3,'2.1'),
('2.1.5','Sueldos y Salarios por Pagar','PASIVO','ACREEDORA',3,'2.1'),
('2.2','PASIVO A LARGO PLAZO','PASIVO','ACREEDORA',2,'2'),
-- PATRIMONIO
('3','PATRIMONIO','PATRIMONIO','ACREEDORA',1,NULL),
('3.1','Capital Social','PATRIMONIO','ACREEDORA',2,'3'),
('3.2','Utilidades Retenidas','PATRIMONIO','ACREEDORA',2,'3'),
('3.3','Utilidad del Ejercicio','PATRIMONIO','ACREEDORA',2,'3'),
-- INGRESOS
('4','INGRESOS','INGRESO','ACREEDORA',1,NULL),
('4.1','Ingresos por Ventas','INGRESO','ACREEDORA',2,'4'),
('4.1.1','Ventas de Servicios','INGRESO','ACREEDORA',3,'4.1'),
('4.1.2','Ventas de Productos','INGRESO','ACREEDORA',3,'4.1'),
('4.2','Otros Ingresos','INGRESO','ACREEDORA',2,'4'),
-- COSTOS
('5','COSTOS','COSTO','DEUDORA',1,NULL),
('5.1','Costo de Ventas','COSTO','DEUDORA',2,'5'),
('5.1.1','Costo de Mercancías Vendidas','COSTO','DEUDORA',3,'5.1'),
-- GASTOS
('6','GASTOS','GASTO','DEUDORA',1,NULL),
('6.1','GASTOS DE OPERACIÓN','GASTO','DEUDORA',2,'6'),
('6.1.1','Sueldos y Salarios','GASTO','DEUDORA',3,'6.1'),
('6.1.2','Alquiler','GASTO','DEUDORA',3,'6.1'),
('6.1.3','Servicios Públicos','GASTO','DEUDORA',3,'6.1'),
('6.1.4','Depreciación','GASTO','DEUDORA',3,'6.1'),
('6.1.5','Papelería y Útiles','GASTO','DEUDORA',3,'6.1'),
('6.2','GASTOS FINANCIEROS','GASTO','DEUDORA',2,'6'),
('6.2.1','Comisiones Bancarias','GASTO','DEUDORA',3,'6.2'),
('6.3','GASTOS ADMINISTRATIVOS','GASTO','DEUDORA',2,'6');

-- ============================================================
-- SOPORTE TÉCNICO (tickets por empresa)
-- ============================================================

CREATE TABLE IF NOT EXISTS tickets_soporte (
  id INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id INT NOT NULL,
  usuario_id INT NOT NULL,
  asunto VARCHAR(300) NOT NULL,
  descripcion TEXT NOT NULL,
  prioridad ENUM('BAJA','MEDIA','ALTA','CRITICA') DEFAULT 'MEDIA',
  estado ENUM('ABIERTO','EN_PROCESO','RESUELTO','CERRADO') DEFAULT 'ABIERTO',
  respuesta TEXT,
  respondido_por INT,
  fecha_respuesta TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

SET FOREIGN_KEY_CHECKS = 1;
