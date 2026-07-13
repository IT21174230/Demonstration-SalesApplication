-- =====================================================================
-- seed_rates.sql — Clear existing rate data and insert 5 rates per type
--
-- Run against the PostgreSQL database AFTER db_creation.sql has created
-- the schema. This script is idempotent: re-run to reset to demo state.
--
-- Usage:  psql -d <dbname> -f seed_rates.sql
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. CLEAR existing data (child tables first to respect FK constraints)
-- =====================================================================

DELETE FROM commodity_container;
DELETE FROM liner_rate;
DELETE FROM vessel_by_vessel_rate;
DELETE FROM spot_rate;
DELETE FROM contracted_fak_rate;
DELETE FROM nac;
DELETE FROM special_rt;

-- Also clear reference data so we can re-insert with known IDs
DELETE FROM liner_port;
DELETE FROM port_pair;
DELETE FROM contact_person;
DELETE FROM client;
DELETE FROM employee;
DELETE FROM liner;
DELETE FROM port;
DELETE FROM trade_lane;

-- Clear inquiries that were created for seed linkage
DELETE FROM fine_charge;
DELETE FROM surcharge;
DELETE FROM quotation_option;
DELETE FROM quotation;
DELETE FROM port_to_port;
DELETE FROM door_to_door;
DELETE FROM inquiry;

-- =====================================================================
-- 2. REFERENCE DATA
-- =====================================================================

-- Trade Lanes
INSERT INTO trade_lane (trln_id, trln_name) OVERRIDING SYSTEM VALUE VALUES
  (1, 'South Asia - Europe'),
  (2, 'Intra-Asia'),
  (3, 'South Asia - Middle East'),
  (4, 'Far East - Europe'),
  (5, 'Transatlantic');

SELECT setval(pg_get_serial_sequence('trade_lane', 'trln_id'), 5);

-- Ports
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

-- Port Pairs
INSERT INTO port_pair (pol_id, pod_id, trln_id, is_bookable) VALUES
  (1, 2, 1, TRUE),   (1, 3, 1, TRUE),   (1, 8, 1, TRUE),
  (1, 9, 1, TRUE),   (6, 3, 1, TRUE),
  (1, 4, 2, TRUE),   (1, 6, 2, TRUE),   (6, 1, 2, TRUE),
  (12, 1, 2, TRUE),  (4, 7, 2, TRUE),
  (1, 5, 3, TRUE),   (1, 10, 3, TRUE),  (6, 5, 3, TRUE),
  (7, 2, 4, TRUE),   (7, 3, 4, TRUE),   (4, 2, 4, TRUE),
  (4, 3, 4, TRUE);

-- Liners
INSERT INTO liner (lin_id, name, is_on_inttra, has_portal) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Maersk Line',               TRUE,  TRUE),
  (2, 'CMA CGM',                   TRUE,  TRUE),
  (3, 'MSC',                       FALSE, TRUE),
  (4, 'Hapag-Lloyd',               TRUE,  TRUE),
  (5, 'ONE (Ocean Network Express)', TRUE, FALSE),
  (6, 'Evergreen Marine',          FALSE, TRUE);

SELECT setval(pg_get_serial_sequence('liner', 'lin_id'), 6);

INSERT INTO liner_port (lin_id, port_id) VALUES
  (1,1),(1,2),(1,3),(1,4),(1,5),(1,6),(1,7),(1,8),
  (2,1),(2,2),(2,3),(2,4),(2,5),(2,6),(2,7),(2,8),
  (3,1),(3,2),(3,3),(3,4),(3,5),(3,7),
  (4,1),(4,2),(4,3),(4,4),(4,5),(4,6),(4,9),
  (5,1),(5,2),(5,3),(5,4),(5,7),
  (6,1),(6,2),(6,3),(6,4),(6,7),(6,8);

-- Employees
INSERT INTO employee (emp_id, name, desig, dept) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Nimal Perera',       'Sales Executive',     'Sales'),
  (2, 'Anjali Silva',       'CS Executive',        'Customer Service'),
  (3, 'Rohan Fernando',     'Sales Executive',     'Sales'),
  (4, 'Priya Jayawardena',  'Finance Manager',     'Finance'),
  (5, 'Kamal Dissanayake',  'Procurement Officer', 'Procurement');

SELECT setval(pg_get_serial_sequence('employee', 'emp_id'), 5);

-- Clients
INSERT INTO client (cli_id, name, vat_no, credit_limit, kyc_completed, city) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Hayleys Logistics',  'VAT-LK-10042',  500000.00, TRUE,  'Colombo'),
  (2, 'Brandix Apparel',    'VAT-LK-10078',  350000.00, TRUE,  'Colombo'),
  (3, 'MAS Holdings',       'VAT-LK-10115',  750000.00, TRUE,  'Colombo'),
  (4, 'Dilmah Tea',         'VAT-LK-10203',  400000.00, TRUE,  'Peliyagoda'),
  (5, 'Customer ABC',       'VAT-LK-10310',  100000.00, TRUE,  'Colombo');

SELECT setval(pg_get_serial_sequence('client', 'cli_id'), 5);

-- Contact Persons
INSERT INTO contact_person (cp_id, cli_id, name, email, whatsapp) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, 'Samantha Perera',        'shipping@hayleys.lk',        '+94712345001'),
  (2, 2, 'Kavinda Silva',          'logistics@brandix.com',      '+94712345002'),
  (3, 3, 'Dinesh Fernando',        'shipping@masholdings.com',   '+94712345003'),
  (4, 4, 'Nalin Wickramasinghe',   'exports@dilmahtea.com',      '+94712345004'),
  (5, 5, 'Rajan Kumar',            'contact@customerabc.com',    '+94712345005');

SELECT setval(pg_get_serial_sequence('contact_person', 'cp_id'), 5);

-- =====================================================================
-- 3. RATE DATA — 5 rates per type (35 total)
-- =====================================================================

-- Contracted (5)
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

-- FAK (5)
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

-- Spot rates parent table (srid 1-5 = pure Spot, 6-10 = VbV, 11-15 = Tariff Rate)
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
  -- Vessel-by-Vessel parent (5)
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
  -- Tariff Rate parent (5)
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

-- Vessel-by-Vessel subtype (5)
INSERT INTO vessel_by_vessel_rate
  (srid, vess_id, rate, departure_date, loading_start_date, loading_end_date)
VALUES
  (6,  'MAERSK-SELETAR',       2600.00, '2026-07-10', '2026-07-08', '2026-07-09'),
  (7,  'CMACGM-MARCO-POLO',    950.00,  '2026-07-08', '2026-07-06', '2026-07-07'),
  (8,  'MSC-OSCAR',            2050.00, '2026-07-15', '2026-07-13', '2026-07-14'),
  (9,  'STUTTGART-EXPRESS',     720.00,  '2026-07-12', '2026-07-10', '2026-07-11'),
  (10, 'EVER-GOLDEN',          2500.00, '2026-07-18', '2026-07-16', '2026-07-17');

-- Tariff Rate subtype (5)
INSERT INTO liner_rate (srid) VALUES (11),(12),(13),(14),(15);

-- NAC (5)
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

-- Special (5)
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

-- Dummy inquiry for commodity_container FK
INSERT INTO inquiry (inq_id, cli_id, descr, type, origin, destination) OVERRIDING SYSTEM VALUE
VALUES (1, 1, 'Seed inquiry for commodity linkage', 'General', 'Colombo', 'Hamburg');

SELECT setval(pg_get_serial_sequence('inquiry', 'inq_id'), 1);

-- Commodity containers linked to special rates
INSERT INTO commodity_container (com_id, inq_id, sprid, name, type, container_type, equipment_type, qty, is_fully_loaded) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, 1, 'Hazardous Chemicals',     'Hazardous',        '20''GP', 'dry',        2, TRUE),
  (2, 1, 2, 'Fresh Produce',           'Food',             '40''RF', 'reefer',     4, TRUE),
  (3, 1, 3, 'Heavy Machinery',         'Oversized',        '40''OT', 'open_top',   1, FALSE),
  (4, 1, 4, 'Pharmaceutical Products', 'Pharmaceuticals',  '20''RF', 'reefer',     3, TRUE),
  (5, 1, 5, 'Livestock (Cattle)',      'Livestock',        '40''GP', 'ventilated', 2, FALSE);

SELECT setval(pg_get_serial_sequence('commodity_container', 'com_id'), 5);

COMMIT;
