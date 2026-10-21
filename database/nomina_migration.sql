-- ============================================================
-- MIGRACIÓN: Módulo de Remuneraciones / Nómina
-- Legislación venezolana: LOTTT, LOPCYMAT, LBCV, LPCL
-- ============================================================

USE facturaVE;

-- Añadir flag de nómina a planes
ALTER TABLE planes_saas ADD COLUMN IF NOT EXISTS tiene_nomina TINYINT(1) DEFAULT 0;
UPDATE planes_saas SET tiene_nomina = 1 WHERE slug IN ('basico','pro','empresa');

-- Datos adicionales de empresa para nómina (patronal IVSS, FAOV, etc.)
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS numero_patronal_ivss VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS numero_cuenta_faov   VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS representante_legal  VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS cedula_representante VARCHAR(15) NULL,
  ADD COLUMN IF NOT EXISTS cargo_representante  VARCHAR(100) NULL,
  -- SMTP por tenant
  ADD COLUMN IF NOT EXISTS smtp_host   VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS smtp_port   INT DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_user   VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS smtp_pass   VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS smtp_from   VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS smtp_ssl    TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS smtp_tls    TINYINT(1) DEFAULT 1;

-- Configuración de parámetros legales de nómina por empresa
CREATE TABLE IF NOT EXISTS config_nomina (
  id                      INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id              INT NOT NULL UNIQUE,
  -- Cesta Ticket Alimentación (Ley de Alimentación para Trabajadores)
  cesta_ticket_dias       INT DEFAULT 40      COMMENT 'Mínimo 40 días hábiles trabajados (modificable)',
  cesta_ticket_valor_dia  DECIMAL(18,4) DEFAULT 0 COMMENT 'Valor en Bs por ticket (0 = usar UT vigente)',
  -- Utilidades (LOTTT art.131: mínimo 15 días, máximo 4 meses)
  dias_utilidades         INT DEFAULT 15      COMMENT 'Días de utilidades/año',
  -- Vacaciones (LOTTT art.190: 15 días + 1 día/año adicional)
  dias_vacaciones         INT DEFAULT 15      COMMENT 'Días base de vacaciones',
  -- Bono Vacacional (LOTTT art.192: mínimo 7 días + 1 día/año)
  dias_bono_vacacional    INT DEFAULT 7       COMMENT 'Días base de bono vacacional',
  -- IVSS (Seguro Social - Ley IVSS)
  riesgo_ivss             ENUM('MINIMO','MEDIO','MAXIMO') DEFAULT 'MINIMO',
  -- Riesgo: MINIMO=9%, MEDIO=10%, MAXIMO=11% patronal; trabajador siempre 4%
  porcentaje_ivss_patronal DECIMAL(5,2) DEFAULT 9.00,
  -- INCES (Ley INCES: 2% patronal, 0.5% trabajador sobre utilidades)
  aplica_inces            TINYINT(1) DEFAULT 1,
  -- Valor Unidad Tributaria vigente (para cesta ticket si se usa UT)
  valor_ut                DECIMAL(18,4) DEFAULT 0,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Trabajadores / Empleados
CREATE TABLE IF NOT EXISTS empleados (
  id                  INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id          INT NOT NULL,
  cedula              VARCHAR(15) NOT NULL,
  nombre              VARCHAR(100) NOT NULL,
  apellido            VARCHAR(100) NOT NULL,
  cargo               VARCHAR(100),
  departamento        VARCHAR(100),
  fecha_ingreso       DATE NOT NULL,
  fecha_egreso        DATE NULL,
  salario_base        DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT 'En USD',
  tipo_contrato       ENUM('FIJO','DETERMINADO','OBRA') DEFAULT 'FIJO',
  -- Datos bancarios para pago
  banco               VARCHAR(100),
  tipo_cuenta         ENUM('CORRIENTE','AHORRO') DEFAULT 'AHORRO',
  numero_cuenta       VARCHAR(30),
  -- Datos para archivos RNET/MPPPST
  codigo_ocupacion    VARCHAR(10)  COMMENT 'Código ocupación MPPPST',
  nivel_instruccion   ENUM('NINGUNA','PRIMARIA','SECUNDARIA','TSU','UNIVERSITARIO','POSTGRADO') DEFAULT 'NINGUNA',
  indigena            TINYINT(1) DEFAULT 0,
  discapacidad        TINYINT(1) DEFAULT 0,
  -- Estado
  activo              TINYINT(1) DEFAULT 1,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_emp_cedula (empresa_id, cedula),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Períodos de nómina
CREATE TABLE IF NOT EXISTS nominas (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  empresa_id      INT NOT NULL,
  periodo         VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  tipo            ENUM('MENSUAL','QUINCENAL_1','QUINCENAL_2','SEMANAL') DEFAULT 'MENSUAL',
  estado          ENUM('BORRADOR','CERRADA','PAGADA') DEFAULT 'BORRADOR',
  tasa_bcv        DECIMAL(18,4) NULL COMMENT 'Tasa BCV al cerrar',
  observaciones   TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at       TIMESTAMP NULL,
  UNIQUE KEY uk_nom_periodo (empresa_id, periodo, tipo),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Líneas de nómina por empleado
CREATE TABLE IF NOT EXISTS nomina_items (
  id                    INT PRIMARY KEY AUTO_INCREMENT,
  nomina_id             INT NOT NULL,
  empleado_id           INT NOT NULL,
  empresa_id            INT NOT NULL,
  -- Días y salario
  dias_trabajados       DECIMAL(5,2) DEFAULT 30,
  salario_base          DECIMAL(18,4) NOT NULL  COMMENT 'Salario base USD del mes',
  -- Asignaciones adicionales
  horas_extra_cantidad  DECIMAL(8,2) DEFAULT 0,
  horas_extra_monto     DECIMAL(18,4) DEFAULT 0,
  bono_produccion       DECIMAL(18,4) DEFAULT 0,
  otros_ingresos        DECIMAL(18,4) DEFAULT 0,
  cesta_ticket          DECIMAL(18,4) DEFAULT 0,
  -- Deducciones trabajador
  ivss_trabajador       DECIMAL(18,4) DEFAULT 0  COMMENT '4% salario normal',
  faov_trabajador       DECIMAL(18,4) DEFAULT 0  COMMENT '1% salario normal',
  inces_trabajador      DECIMAL(18,4) DEFAULT 0  COMMENT '0.5% sobre utilidades (solo en nom. utilidades)',
  islr_retenido         DECIMAL(18,4) DEFAULT 0,
  prestamos_deduc       DECIMAL(18,4) DEFAULT 0,
  otras_deducciones     DECIMAL(18,4) DEFAULT 0,
  -- Aportes patronales (no afectan el neto del trabajador)
  ivss_patronal         DECIMAL(18,4) DEFAULT 0  COMMENT '9-11% según riesgo IVSS',
  faov_patronal         DECIMAL(18,4) DEFAULT 0  COMMENT '2% salario normal',
  inces_patronal        DECIMAL(18,4) DEFAULT 0  COMMENT '2% total salarios',
  -- Totales calculados
  total_asignaciones    DECIMAL(18,4) DEFAULT 0,
  total_deducciones     DECIMAL(18,4) DEFAULT 0,
  neto_pagar            DECIMAL(18,4) DEFAULT 0,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (nomina_id) REFERENCES nominas(id),
  FOREIGN KEY (empleado_id) REFERENCES empleados(id)
);

-- Insertar config_nomina por defecto para empresa existente (id=1)
INSERT IGNORE INTO config_nomina (empresa_id) VALUES (1);
