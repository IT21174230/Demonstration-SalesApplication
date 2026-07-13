-- =====================================================================
-- CL Connect / FreightOS  —  PostgreSQL schema
-- Generated from the Chen EER diagram (FreightOS-ER_6).
--
-- Conventions
--   * snake_case identifiers; each entity PK is a surrogate BIGINT IDENTITY
--     unless the diagram used a natural key (e.g. zip_code.zip).
--   * White underlined ovals in the diagram = foreign keys (as instructed).
--   * ISA / ∀SI specializations are implemented with the "shared-PK" pattern:
--     each subtype table's PK is also a FK to the supertype's PK.
--   * Reserved words avoided: desc -> descr, date -> quote_date.
--
-- Assumptions (ambiguous in the source image) are tagged  -- ASSUMPTION:
-- Reworded/renamed items are tagged                        -- NOTE:
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Geography & lanes
-- ---------------------------------------------------------------------
CREATE TABLE trade_lane (
    trln_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trln_name   TEXT NOT NULL
    -- Consider a `direction` column (headhaul/backhaul); lanes are directional.
);

CREATE TABLE port (
    port_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL,
    country     TEXT
    -- Consider `unlocode` for the UN/LOCODE.
);

CREATE TABLE zip_code (
    zip           VARCHAR(12) PRIMARY KEY,
    region_state  TEXT,
    trln_id       BIGINT REFERENCES trade_lane(trln_id),   -- FK (white oval)
    port_id       BIGINT REFERENCES port(port_id)          -- FK (white oval); Port "has" ZipCodes
);

-- PortPair: associative entity. No PK oval was drawn, so the natural key is
-- the (origin, destination) port combination.
CREATE TABLE port_pair (
    pol_id       BIGINT NOT NULL REFERENCES port(port_id),       -- FK: POL (loading)
    pod_id       BIGINT NOT NULL REFERENCES port(port_id),       -- FK: POD (discharge)
    trln_id      BIGINT NOT NULL REFERENCES trade_lane(trln_id), -- FK: groups
    is_bookable  BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (pol_id, pod_id),
    CHECK (pol_id <> pod_id)
);

-- ---------------------------------------------------------------------
-- 2. Liners & rates
-- ---------------------------------------------------------------------
CREATE TABLE liner (
    lin_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT NOT NULL,
    is_on_inttra  BOOLEAN NOT NULL DEFAULT FALSE,
    has_portal    BOOLEAN NOT NULL DEFAULT FALSE
);

-- ASSUMPTION: the "supports" diamond = which ports a liner serves (M:N).
CREATE TABLE liner_port (
    lin_id   BIGINT NOT NULL REFERENCES liner(lin_id),
    port_id  BIGINT NOT NULL REFERENCES port(port_id),
    PRIMARY KEY (lin_id, port_id)
);

CREATE TABLE contracted_fak_rate (
    crate_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lin_id          BIGINT NOT NULL REFERENCES liner(lin_id),        -- FK: gives
    trln_id         BIGINT NOT NULL REFERENCES trade_lane(trln_id),  -- FK: has
    type            TEXT,           -- Contracted vs FAK (FAK is commodity-agnostic by design)
    rate            NUMERIC(14,4),
    container_type  TEXT,
    currency        VARCHAR(3) DEFAULT 'USD',
    service_scope   TEXT,           -- Import / Export / Within
    valid_from      DATE,
    valid_to        DATE,
    remark          TEXT
);

-- Spot Rate is the supertype of Vessel-by-Vessel Rate and Tariff Rate (∀SI).
CREATE TABLE spot_rate (
    srid           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lin_id         BIGINT NOT NULL REFERENCES liner(lin_id),        -- FK: gives
    trln_id        BIGINT NOT NULL REFERENCES trade_lane(trln_id),  -- FK: has
    container_type TEXT,
    rate           NUMERIC(14,4),
    currency       VARCHAR(3) DEFAULT 'USD',
    is_sold        BOOLEAN NOT NULL DEFAULT FALSE,
    service_scope  TEXT,           -- Import / Export / Within
    valid_from     DATE,
    valid_to       DATE,
    remark         TEXT
);

-- ISA subtype. NOTE: diagram shows vess_id as the subtype's own key; under the
-- shared-PK ISA pattern the identity is srid, and vess_id is kept as a unique attr.
CREATE TABLE vessel_by_vessel_rate (
    srid                BIGINT PRIMARY KEY REFERENCES spot_rate(srid) ON DELETE CASCADE,
    vess_id             TEXT UNIQUE,
    rate                NUMERIC(14,4),
    departure_date      DATE,
    loading_start_date  DATE,
    loading_end_date    DATE
);

-- ISA subtype (no additional attributes were drawn).
CREATE TABLE liner_rate (
    srid  BIGINT PRIMARY KEY REFERENCES spot_rate(srid) ON DELETE CASCADE
);

-- Commodity/lane special rate ("get" relationship target).
CREATE TABLE special_rt (
    sprid          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rate           NUMERIC(14,4),
    currency       VARCHAR(3) DEFAULT 'USD',
    service_scope  TEXT,           -- Import / Export / Within
    valid_from     DATE,
    valid_to       DATE,
    remark         TEXT
);

-- ---------------------------------------------------------------------
-- 3. Customers & people
-- ---------------------------------------------------------------------
CREATE TABLE client (
    cli_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT NOT NULL,
    vat_no        TEXT,
    tin           TEXT,
    credit_limit  NUMERIC(14,2),
    kyc_completed BOOLEAN NOT NULL DEFAULT FALSE,
    strt_ln       TEXT,   -- composite attribute Address -> {Strt/Ln, City}
    city          TEXT
);

CREATE TABLE contact_person (
    cp_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cli_id    BIGINT NOT NULL REFERENCES client(cli_id),   -- FK: Client "has" Contact
    name      TEXT,
    email     TEXT,
    whatsapp  TEXT,
    wechat    TEXT
);

CREATE TABLE employee (
    emp_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name    TEXT NOT NULL,
    desig   TEXT,
    dept    TEXT
);

-- ISA subtypes of Employee.
CREATE TABLE team_member (
    emp_id  BIGINT PRIMARY KEY REFERENCES employee(emp_id) ON DELETE CASCADE
);
CREATE TABLE hod (
    emp_id  BIGINT PRIMARY KEY REFERENCES employee(emp_id) ON DELETE CASCADE
);

CREATE TABLE resource (
    res_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resource_name  TEXT NOT NULL   -- NOTE: "Resourse" in diagram
);

-- "grants access": M:N between employees (team member / HOD) and resources.
-- ASSUMPTION: referenced to employee (the supertype) rather than each subtype.
CREATE TABLE grants_access (
    emp_id  BIGINT NOT NULL REFERENCES employee(emp_id),
    res_id  BIGINT NOT NULL REFERENCES resource(res_id),
    PRIMARY KEY (emp_id, res_id)
);

-- NAC (named-account contract). emp_id = assigned salesperson ("Access");
-- cp_id realizes the "has" from Contact Person.
CREATE TABLE nac (
    nac_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trln_id       BIGINT NOT NULL REFERENCES trade_lane(trln_id),  -- FK
    emp_id        BIGINT REFERENCES employee(emp_id),              -- FK: assigned salesperson
    cp_id         BIGINT REFERENCES contact_person(cp_id),         -- FK: "has" (see NOTE below)
    origin        TEXT,
    destination   TEXT,
    rate          NUMERIC(14,4),
    currency      VARCHAR(3) DEFAULT 'USD',
    service_scope TEXT,           -- Import / Export / Within
    valid_from    DATE,
    valid_to      DATE,
    remark        TEXT
    -- NOTE: a NAC is usually a client-level contract; consider referencing
    --       client(cli_id) instead of / in addition to contact_person.
);

-- ---------------------------------------------------------------------
-- 4. Inquiry and its lines
-- ---------------------------------------------------------------------
CREATE TABLE inquiry (
    inq_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cli_id       BIGINT NOT NULL REFERENCES client(cli_id),          -- FK: Client "has"
    cp_id        BIGINT REFERENCES contact_person(cp_id),            -- FK: "files"
    descr        TEXT,           -- NOTE: "Desc" in diagram
    type         TEXT,
    origin       TEXT,           -- free-text capture; resolve to ports/pair later
    destination  TEXT,
    priority     TEXT,
    remark       TEXT
    -- NOTE: diagram labels the contact FK "ContID"; mapped to cp_id for consistency
    --       with the renamed contact_person PK.
);

-- ISA subtypes of Inquiry = requested service scope.
CREATE TABLE door_to_door (
    inq_id  BIGINT PRIMARY KEY REFERENCES inquiry(inq_id) ON DELETE CASCADE
);
CREATE TABLE port_to_port (
    inq_id  BIGINT PRIMARY KEY REFERENCES inquiry(inq_id) ON DELETE CASCADE
);

-- MERGED TABLE: Commodity + Container in one table, as requested.
-- Grain = one commodity line as loaded in one container, per inquiry (1:1 merge).
-- Commodity columns: name, type, dimensions, weight, remark.
-- Container columns: container_type, qty, is_fully_loaded, equipment_type.
CREATE TABLE commodity_container (
    com_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inq_id          BIGINT NOT NULL REFERENCES inquiry(inq_id),   -- FK: "contain"
    sprid           BIGINT REFERENCES special_rt(sprid),          -- FK: "get" (special rate)
    -- commodity attributes
    name            TEXT,
    type            TEXT,
    dimensions      TEXT,
    weight          NUMERIC(12,3),
    remark          TEXT,
    -- container attributes
    container_type  TEXT,           -- e.g. 20ft / 40ft / 40HC
    equipment_type  TEXT,           -- dry / reefer / open_top / flat_rack / tank
    qty             INTEGER CHECK (qty > 0),
    is_fully_loaded BOOLEAN
    -- NOTE: original Container had its own PK (ContID) and its own inq_id FK;
    --       merge keeps a single PK (com_id) and single inq_id.
);

CREATE TABLE fine_charge (
    char_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inq_id   BIGINT NOT NULL REFERENCES inquiry(inq_id),   -- FK: Inquiry "has"
    name     TEXT,
    amt      NUMERIC(14,2),
    remark   TEXT
);

CREATE TABLE surcharge (
    sur_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inq_id    BIGINT NOT NULL REFERENCES inquiry(inq_id),  -- FK: "Calculated"
    type      TEXT,
    amt       NUMERIC(14,2),
    currency  VARCHAR(3)
);

-- ---------------------------------------------------------------------
-- 5. Quotation
-- ---------------------------------------------------------------------
CREATE TABLE quotation (
    quote_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inq_id              BIGINT NOT NULL REFERENCES inquiry(inq_id),  -- FK: generated from inquiry
    emp_id              BIGINT REFERENCES employee(emp_id),          -- FK: "Preps"
    status              TEXT,
    quote_date          DATE,        -- NOTE: "Date" in diagram
    is_follow_up        BOOLEAN NOT NULL DEFAULT FALSE,
    acceptance_deadline DATE,        -- NOTE: "acceptenceDeadline" in diagram
    sent_via            TEXT         -- email / whatsapp
);

-- Option: weak entity owned by Quotation.
CREATE TABLE quotation_option (
    quote_id  BIGINT NOT NULL REFERENCES quotation(quote_id) ON DELETE CASCADE,
    opt_no    SMALLINT NOT NULL,     -- partial key
    rate      NUMERIC(14,4),
    remark    TEXT,
    PRIMARY KEY (quote_id, opt_no)
    -- Consider lin_id (FK -> liner) and a rate-source FK so each option
    -- records which liner/rate it came from.
);

-- ---------------------------------------------------------------------
-- 6. Destination agents & fulfilment  (beyond Flow 1 — best-effort)
-- ---------------------------------------------------------------------
-- ASSUMPTION: Port "has" DestinationAgents (agent tied to a port).
CREATE TABLE destination_agents (
    agent_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    port_id   BIGINT REFERENCES port(port_id)
);

-- ContractedRates for agents, specialized into Trucking / Train (ISA).
CREATE TABLE contracted_rates (
    cr_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id  BIGINT NOT NULL REFERENCES destination_agents(agent_id)  -- FK: "has"
);
CREATE TABLE trucking (
    cr_id  BIGINT PRIMARY KEY REFERENCES contracted_rates(cr_id) ON DELETE CASCADE
);
CREATE TABLE train (
    cr_id  BIGINT PRIMARY KEY REFERENCES contracted_rates(cr_id) ON DELETE CASCADE
);

-- ASSUMPTION: "delegates to" links DestinationAgents to LinerDelivery.
CREATE TABLE liner_delivery (
    delivery_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id     BIGINT REFERENCES destination_agents(agent_id)
);

-- ---------------------------------------------------------------------
-- Helpful indexes on FK columns (Postgres does not auto-index FKs)
-- ---------------------------------------------------------------------
CREATE INDEX idx_zip_code_trln          ON zip_code(trln_id);
CREATE INDEX idx_zip_code_port          ON zip_code(port_id);
CREATE INDEX idx_port_pair_trln         ON port_pair(trln_id);
CREATE INDEX idx_cfr_lin                ON contracted_fak_rate(lin_id);
CREATE INDEX idx_cfr_trln               ON contracted_fak_rate(trln_id);
CREATE INDEX idx_spot_lin               ON spot_rate(lin_id);
CREATE INDEX idx_spot_trln              ON spot_rate(trln_id);
CREATE INDEX idx_contact_cli            ON contact_person(cli_id);
CREATE INDEX idx_nac_trln               ON nac(trln_id);
CREATE INDEX idx_nac_emp                ON nac(emp_id);
CREATE INDEX idx_nac_cp                 ON nac(cp_id);
CREATE INDEX idx_inquiry_cli            ON inquiry(cli_id);
CREATE INDEX idx_inquiry_cp             ON inquiry(cp_id);
CREATE INDEX idx_comcon_inq             ON commodity_container(inq_id);
CREATE INDEX idx_comcon_sprid           ON commodity_container(sprid);
CREATE INDEX idx_fine_inq               ON fine_charge(inq_id);
CREATE INDEX idx_surcharge_inq          ON surcharge(inq_id);
CREATE INDEX idx_quotation_inq          ON quotation(inq_id);
CREATE INDEX idx_quotation_emp          ON quotation(emp_id);

COMMIT;

-- =====================================================================
-- SEED DATA — Reference tables + Rate data (5 per rate type)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Trade Lanes
-- ---------------------------------------------------------------------
INSERT INTO trade_lane (trln_id, trln_name) OVERRIDING SYSTEM VALUE VALUES
  (1, 'South Asia - Europe'),
  (2, 'Intra-Asia'),
  (3, 'South Asia - Middle East'),
  (4, 'Far East - Europe'),
  (5, 'Transatlantic');

SELECT setval(pg_get_serial_sequence('trade_lane', 'trln_id'), 5);

-- ---------------------------------------------------------------------
-- Ports
-- ---------------------------------------------------------------------
INSERT INTO port (port_id, name, country) OVERRIDING SYSTEM VALUE VALUES
  (1,  'Colombo',     'Sri Lanka'),
  (2,  'Hamburg',      'Germany'),
  (3,  'Rotterdam',    'Netherlands'),
  (4,  'Singapore',    'Singapore'),
  (5,  'Dubai',        'UAE'),
  (6,  'Mumbai',       'India'),
  (7,  'Shanghai',     'China'),
  (8,  'Antwerp',      'Belgium'),
  (9,  'Felixstowe',   'United Kingdom'),
  (10, 'Jebel Ali',    'UAE'),
  (11, 'Nhava Sheva',  'India'),
  (12, 'Chennai',      'India');

SELECT setval(pg_get_serial_sequence('port', 'port_id'), 12);

-- ---------------------------------------------------------------------
-- Port Pairs (route → trade lane mapping)
-- ---------------------------------------------------------------------
INSERT INTO port_pair (pol_id, pod_id, trln_id, is_bookable) VALUES
  -- South Asia - Europe (trln 1)
  (1, 2, 1, TRUE),   -- Colombo → Hamburg
  (1, 3, 1, TRUE),   -- Colombo → Rotterdam
  (1, 8, 1, TRUE),   -- Colombo → Antwerp
  (1, 9, 1, TRUE),   -- Colombo → Felixstowe
  (6, 3, 1, TRUE),   -- Mumbai → Rotterdam
  -- Intra-Asia (trln 2)
  (1, 4, 2, TRUE),   -- Colombo → Singapore
  (1, 6, 2, TRUE),   -- Colombo → Mumbai
  (6, 1, 2, TRUE),   -- Mumbai → Colombo
  (12, 1, 2, TRUE),  -- Chennai → Colombo
  (4, 7, 2, TRUE),   -- Singapore → Shanghai
  -- South Asia - Middle East (trln 3)
  (1, 5, 3, TRUE),   -- Colombo → Dubai
  (1, 10, 3, TRUE),  -- Colombo → Jebel Ali
  (6, 5, 3, TRUE),   -- Mumbai → Dubai
  -- Far East - Europe (trln 4)
  (7, 2, 4, TRUE),   -- Shanghai → Hamburg
  (7, 3, 4, TRUE),   -- Shanghai → Rotterdam
  (4, 2, 4, TRUE),   -- Singapore → Hamburg
  (4, 3, 4, TRUE);   -- Singapore → Rotterdam

-- ---------------------------------------------------------------------
-- Liners
-- ---------------------------------------------------------------------
INSERT INTO liner (lin_id, name, is_on_inttra, has_portal) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Maersk Line',               TRUE,  TRUE),
  (2, 'CMA CGM',                   TRUE,  TRUE),
  (3, 'MSC',                       FALSE, TRUE),
  (4, 'Hapag-Lloyd',               TRUE,  TRUE),
  (5, 'ONE (Ocean Network Express)', TRUE, FALSE),
  (6, 'Evergreen Marine',          FALSE, TRUE);

SELECT setval(pg_get_serial_sequence('liner', 'lin_id'), 6);

-- Liner-port coverage (which ports each liner serves)
INSERT INTO liner_port (lin_id, port_id) VALUES
  (1,1),(1,2),(1,3),(1,4),(1,5),(1,6),(1,7),(1,8),
  (2,1),(2,2),(2,3),(2,4),(2,5),(2,6),(2,7),(2,8),
  (3,1),(3,2),(3,3),(3,4),(3,5),(3,7),
  (4,1),(4,2),(4,3),(4,4),(4,5),(4,6),(4,9),
  (5,1),(5,2),(5,3),(5,4),(5,7),
  (6,1),(6,2),(6,3),(6,4),(6,7),(6,8);

-- ---------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------
INSERT INTO employee (emp_id, name, desig, dept) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Nimal Perera',       'Sales Executive',     'Sales'),
  (2, 'Anjali Silva',       'CS Executive',        'Customer Service'),
  (3, 'Rohan Fernando',     'Sales Executive',     'Sales'),
  (4, 'Priya Jayawardena',  'Finance Manager',     'Finance'),
  (5, 'Kamal Dissanayake',  'Procurement Officer', 'Procurement');

SELECT setval(pg_get_serial_sequence('employee', 'emp_id'), 5);

-- ---------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------
INSERT INTO client (cli_id, name, vat_no, credit_limit, kyc_completed, city) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Hayleys Logistics',  'VAT-LK-10042',  500000.00, TRUE,  'Colombo'),
  (2, 'Brandix Apparel',    'VAT-LK-10078',  350000.00, TRUE,  'Colombo'),
  (3, 'MAS Holdings',       'VAT-LK-10115',  750000.00, TRUE,  'Colombo'),
  (4, 'Dilmah Tea',         'VAT-LK-10203',  400000.00, TRUE,  'Peliyagoda'),
  (5, 'Customer ABC',       'VAT-LK-10310',  100000.00, TRUE,  'Colombo');

SELECT setval(pg_get_serial_sequence('client', 'cli_id'), 5);

-- ---------------------------------------------------------------------
-- Contact Persons
-- ---------------------------------------------------------------------
INSERT INTO contact_person (cp_id, cli_id, name, email, whatsapp) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, 'Samantha Perera',        'shipping@hayleys.lk',        '+94712345001'),
  (2, 2, 'Kavinda Silva',          'logistics@brandix.com',      '+94712345002'),
  (3, 3, 'Dinesh Fernando',        'shipping@masholdings.com',   '+94712345003'),
  (4, 4, 'Nalin Wickramasinghe',   'exports@dilmahtea.com',      '+94712345004'),
  (5, 5, 'Rajan Kumar',            'contact@customerabc.com',    '+94712345005');

SELECT setval(pg_get_serial_sequence('contact_person', 'cp_id'), 5);

-- =====================================================================
-- RATE SEED DATA — 5 rates per type (35 total)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Contracted Rates (5) — long-term contract rates
-- ---------------------------------------------------------------------
INSERT INTO contracted_fak_rate
  (crate_id, lin_id, trln_id, type, rate, container_type, currency, service_scope, valid_from, valid_to, remark)
  OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 1, 'Contracted', 2450.00, '40''HC', 'USD', 'Export', '2026-01-01', '2026-12-31',
   'Annual contract — Maersk premium service to Europe'),
  (2, 2, 2, 'Contracted', 850.00,  '20''GP', 'USD', 'Export', '2026-01-01', '2026-12-31',
   'CMA CGM intra-Asia feeder rate'),
  (3, 4, 1, 'Contracted', 2200.00, '40''GP', 'USD', 'Export', '2026-03-01', '2027-02-28',
   'Hapag-Lloyd direct Colombo–Rotterdam service'),
  (4, 3, 4, 'Contracted', 1950.00, '40''HC', 'USD', 'Import', '2026-01-01', '2026-06-30',
   'MSC Far East inbound — Shanghai transshipment'),
  (5, 5, 3, 'Contracted', 680.00,  '20''GP', 'USD', 'Export', '2026-04-01', '2027-03-31',
   'ONE Gulf service — competitive short-haul rate');

-- ---------------------------------------------------------------------
-- 2. FAK Rates (5) — Freight All Kinds
-- ---------------------------------------------------------------------
INSERT INTO contracted_fak_rate
  (crate_id, lin_id, trln_id, type, rate, container_type, currency, service_scope, valid_from, valid_to, remark)
  OVERRIDING SYSTEM VALUE
VALUES
  (6,  1, 2, 'FAK', 1100.00, '40''GP', 'USD', 'Export', '2026-06-01', '2026-08-31',
   'Maersk FAK summer promo — Intra-Asia'),
  (7,  6, 4, 'FAK', 2800.00, '40''HC', 'USD', 'Import', '2026-05-01', '2026-07-31',
   'Evergreen FAK — Far East to Europe peak season'),
  (8,  2, 3, 'FAK', 750.00,  '20''GP', 'USD', 'Export', '2026-06-01', '2026-09-30',
   'CMA CGM FAK — Gulf route all commodities'),
  (9,  3, 1, 'FAK', 2650.00, '40''HC', 'USD', 'Export', '2026-06-15', '2026-09-15',
   'MSC FAK Europe — summer capacity release'),
  (10, 4, 2, 'FAK', 920.00,  '20''GP', 'USD', 'Import', '2026-07-01', '2026-09-30',
   'Hapag-Lloyd FAK intra-Asia backhaul');

SELECT setval(pg_get_serial_sequence('contracted_fak_rate', 'crate_id'), 10);

-- ---------------------------------------------------------------------
-- 3. Spot Rates — parent table for all spot-based rates
--    srid 1-5  = pure Spot
--    srid 6-10 = Vessel-by-Vessel (subtype)
--    srid 11-15 = Tariff Rate (subtype)
-- ---------------------------------------------------------------------
INSERT INTO spot_rate
  (srid, lin_id, trln_id, container_type, rate, currency, is_sold, service_scope, valid_from, valid_to, remark)
  OVERRIDING SYSTEM VALUE
VALUES
  -- Pure Spot (5)
  (1,  1, 1, '40''HC', 2750.00, 'USD', FALSE, 'Export', '2026-07-01', '2026-07-15',
   'Spot — Maersk space available on MV Sealand'),
  (2,  2, 2, '20''GP', 980.00,  'USD', TRUE,  'Export', '2026-06-28', '2026-07-12',
   'Spot — CMA CGM feeder sold to Brandix'),
  (3,  3, 3, '40''GP', 1350.00, 'USD', FALSE, 'Export', '2026-07-01', '2026-07-14',
   'Spot — MSC Gulf direct sailing'),
  (4,  5, 4, '40''HC', 2100.00, 'USD', FALSE, 'Import', '2026-07-05', '2026-07-20',
   'Spot — ONE Shanghai–Hamburg express'),
  (5,  4, 2, '20''GP', 870.00,  'USD', TRUE,  'Within', '2026-06-25', '2026-07-10',
   'Spot — Hapag intra-Asia sold out'),

  -- Vessel-by-Vessel parent rows (5)
  (6,  1, 1, '40''HC', 2600.00, 'USD', FALSE, 'Export', '2026-07-01', '2026-07-31',
   'VbV — Maersk Seletar sailing Jul 10'),
  (7,  2, 2, '20''GP', 950.00,  'USD', FALSE, 'Export', '2026-07-01', '2026-07-20',
   'VbV — CMA CGM Marco Polo feeder'),
  (8,  3, 4, '40''GP', 2050.00, 'USD', TRUE,  'Import', '2026-07-05', '2026-07-25',
   'VbV — MSC Oscar fully booked'),
  (9,  4, 3, '20''GP', 720.00,  'USD', FALSE, 'Export', '2026-07-01', '2026-07-20',
   'VbV — Stuttgart Express Gulf run'),
  (10, 6, 1, '40''HC', 2500.00, 'USD', FALSE, 'Export', '2026-07-10', '2026-07-30',
   'VbV — Ever Golden Europe service'),

  -- Tariff Rate parent rows (5)
  (11, 1, 2, '40''GP', 1200.00, 'USD', FALSE, 'Export', '2026-07-01', '2026-09-30',
   'Liner published — Maersk Asia standard'),
  (12, 2, 1, '40''HC', 2550.00, 'USD', FALSE, 'Export', '2026-07-01', '2026-09-30',
   'Liner published — CMA CGM Europe direct'),
  (13, 3, 3, '20''GP', 800.00,  'USD', TRUE,  'Export', '2026-07-01', '2026-08-31',
   'Liner published — MSC Gulf tariff (sold)'),
  (14, 5, 4, '40''HC', 2350.00, 'USD', FALSE, 'Import', '2026-07-01', '2026-09-30',
   'Liner published — ONE Far East import'),
  (15, 4, 2, '20''GP', 950.00,  'USD', TRUE,  'Within', '2026-07-01', '2026-08-31',
   'Liner published — Hapag intra-Asia (sold)');

SELECT setval(pg_get_serial_sequence('spot_rate', 'srid'), 15);

-- ---------------------------------------------------------------------
-- 4. Vessel-by-Vessel Rate subtype (5)
-- ---------------------------------------------------------------------
INSERT INTO vessel_by_vessel_rate
  (srid, vess_id, rate, departure_date, loading_start_date, loading_end_date)
VALUES
  (6,  'MAERSK-SELETAR',       2600.00, '2026-07-10', '2026-07-08', '2026-07-09'),
  (7,  'CMACGM-MARCO-POLO',    950.00,  '2026-07-08', '2026-07-06', '2026-07-07'),
  (8,  'MSC-OSCAR',            2050.00, '2026-07-15', '2026-07-13', '2026-07-14'),
  (9,  'STUTTGART-EXPRESS',     720.00,  '2026-07-12', '2026-07-10', '2026-07-11'),
  (10, 'EVER-GOLDEN',          2500.00, '2026-07-18', '2026-07-16', '2026-07-17');

-- ---------------------------------------------------------------------
-- 5. Tariff Rate subtype (5)
-- ---------------------------------------------------------------------
INSERT INTO liner_rate (srid) VALUES (11),(12),(13),(14),(15);

-- ---------------------------------------------------------------------
-- 6. NAC Rates (5) — Named Account Contracts
-- ---------------------------------------------------------------------
INSERT INTO nac
  (nac_id, trln_id, emp_id, cp_id, origin, destination, rate, currency, service_scope, valid_from, valid_to, remark)
  OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 1, 1, 'Colombo', 'Hamburg',    2300.00, 'USD', 'Export', '2026-01-01', '2026-12-31',
   'Hayleys key-account annual contract — Europe lane'),
  (2, 2, 3, 2, 'Colombo', 'Singapore',  900.00,  'USD', 'Export', '2026-04-01', '2027-03-31',
   'Brandix garment exports — weekly consolidation'),
  (3, 1, 1, 3, 'Colombo', 'Rotterdam',  2150.00, 'USD', 'Export', '2026-01-01', '2026-12-31',
   'MAS Holdings — preferential Europe rate'),
  (4, 3, 2, 4, 'Colombo', 'Dubai',      650.00,  'USD', 'Export', '2026-06-01', '2027-05-31',
   'Dilmah Tea — reefer tea exports to Gulf'),
  (5, 2, 1, 5, 'Mumbai',  'Colombo',    780.00,  'USD', 'Import', '2026-03-01', '2026-12-31',
   'Customer ABC — raw material imports from India');

SELECT setval(pg_get_serial_sequence('nac', 'nac_id'), 5);

-- ---------------------------------------------------------------------
-- 7. Special Rates (5) — commodity-specific rates
-- ---------------------------------------------------------------------
INSERT INTO special_rt
  (sprid, rate, currency, service_scope, valid_from, valid_to, remark)
  OVERRIDING SYSTEM VALUE
VALUES
  (1, 3500.00, 'USD', 'Export', '2026-01-01', '2026-12-31',
   'IMO Class 3/6 hazmat surcharge — requires DG declaration'),
  (2, 2800.00, 'USD', 'Export', '2026-01-01', '2026-12-31',
   'Reefer perishable cargo — temperature-controlled 2-8°C'),
  (3, 4200.00, 'USD', 'Import', '2026-04-01', '2027-03-31',
   'Out-of-gauge / oversized cargo — flat rack or open top'),
  (4, 3100.00, 'USD', 'Export', '2026-06-01', '2026-11-30',
   'GDP-compliant pharma shipment — cold chain verified'),
  (5, 5500.00, 'USD', 'Export', '2026-01-01', '2026-12-31',
   'Live animal transport — ventilated container required');

SELECT setval(pg_get_serial_sequence('special_rt', 'sprid'), 5);

-- Dummy inquiry for commodity_container FK requirement
INSERT INTO inquiry (inq_id, cli_id, descr, type, origin, destination) OVERRIDING SYSTEM VALUE
VALUES (1, 1, 'Seed inquiry for commodity linkage', 'General', 'Colombo', 'Hamburg');

SELECT setval(pg_get_serial_sequence('inquiry', 'inq_id'), 1);

-- Commodity containers linked to special rates (for commodity_name / commodity_type display)
INSERT INTO commodity_container (com_id, inq_id, sprid, name, type, container_type, equipment_type, qty, is_fully_loaded) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, 1, 'Hazardous Chemicals',     'Hazardous',        '20''GP', 'dry',    2,  TRUE),
  (2, 1, 2, 'Fresh Produce',           'Food',             '40''RF', 'reefer', 4,  TRUE),
  (3, 1, 3, 'Heavy Machinery',         'Oversized',        '40''OT', 'open_top', 1, FALSE),
  (4, 1, 4, 'Pharmaceutical Products', 'Pharmaceuticals',  '20''RF', 'reefer', 3,  TRUE),
  (5, 1, 5, 'Livestock (Cattle)',      'Livestock',        '40''GP', 'ventilated', 2, FALSE);

SELECT setval(pg_get_serial_sequence('commodity_container', 'com_id'), 5);

COMMIT;