-- ============================================================
-- MIGRACIÓN: Multi-empresa + Métodos de pago + Solicitudes
-- ============================================================
USE facturaVE;

-- Métodos de pago configurables desde Superadmin
CREATE TABLE IF NOT EXISTS metodos_pago (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  nombre      VARCHAR(100) NOT NULL,
  descripcion VARCHAR(300),
  instrucciones TEXT COMMENT 'Datos para pagar: número de cuenta, email Zelle, etc.',
  activo      TINYINT(1) DEFAULT 1,
  orden       INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO metodos_pago (nombre, descripcion, instrucciones, orden) VALUES
('Zelle',        'Pago por Zelle (USD)',            'Email Zelle: pagos@amaysgroup.com — Nombre: AmaysGroup', 1),
('Transferencia bancaria', 'Transferencia en bolívares', 'Banco de Venezuela — Cuenta corriente 0102-XXXX — RIF J-XXXXX', 2),
('Efectivo USD', 'Pago en efectivo dólares',        'Coordinar entrega con nuestro equipo', 3);

-- Solicitudes de adquisición / upgrade de plan
CREATE TABLE IF NOT EXISTS solicitudes_plan (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id       INT NULL COMMENT 'NULL = cliente nuevo',
  nombre_contacto  VARCHAR(200) NOT NULL,
  email_contacto   VARCHAR(200) NOT NULL,
  telefono         VARCHAR(30),
  rif_empresa      VARCHAR(20),
  razon_social     VARCHAR(200),
  plan_id          INT NOT NULL,
  metodo_pago_id   INT,
  monto_usd        DECIMAL(10,2),
  comprobante_ref  VARCHAR(200) COMMENT 'Referencia de pago enviada por el cliente',
  estado           ENUM('PENDIENTE','APROBADA','RECHAZADA') DEFAULT 'PENDIENTE',
  notas_admin      TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES planes_saas(id)
);

-- Accesos multi-empresa: un usuario puede operar en N empresas
CREATE TABLE IF NOT EXISTS accesos_empresa (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id  INT NOT NULL,
  empresa_id  INT NOT NULL,
  activo      TINYINT(1) DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_acc (usuario_id, empresa_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Añadir tiene_nomina a planes si no existe
ALTER TABLE planes_saas ADD COLUMN IF NOT EXISTS tiene_nomina TINYINT(1) DEFAULT 0;
UPDATE planes_saas SET tiene_nomina = 1 WHERE slug IN ('pro','empresa','nomina-contabilidad');

-- Plan Nómina & Contabilidad si no existe
INSERT IGNORE INTO planes_saas
  (nombre, slug, max_facturas_mes, max_usuarios,
   tiene_retenciones, tiene_guias, tiene_api, tiene_multiusuario,
   tiene_inventario, tiene_compras, tiene_contabilidad, tiene_nomina,
   nivel_soporte, sla_horas, precio_usd, activo)
VALUES
  ('Nómina & Contabilidad','nomina-contabilidad', 0, 3,
   0,0,0,0, 0,0,1,1,
   'EMAIL', 72, 14.99, 1);
