CREATE SCHEMA "public";
CREATE TABLE "client" (
	"cli_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "client_cli_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(150) NOT NULL,
	"vat_no" varchar(40),
	"tin" varchar(40),
	"credit_limit" numeric(14, 2),
	"kyc_completed" boolean DEFAULT false,
	"addr_street_ln" varchar(50),
	"addr_city" varchar(20),
	"assigned_to" bigint,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emp_id" bigint,
	"addr_country" varchar(20)
);
CREATE TABLE "commodity" (
	"com_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "commodity_com_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"inq_id" bigint NOT NULL,
	"name" varchar(120),
	"com_type" varchar(60),
	"description" text,
	"weight" numeric(12, 3),
	"remark" text,
	"hs_code" varchar(15)
);
CREATE TABLE "cont_rt_assignment" (
	"fak_id" bigint,
	"inq_id" bigint,
	"volume_allocated" integer,
	CONSTRAINT "cont_rt_assignment_pkey" PRIMARY KEY("fak_id","inq_id")
);
CREATE TABLE "contact_person" (
	"cpid" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contact_person_cpid_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cli_id" bigint NOT NULL,
	"emp_id" bigint,
	"name" varchar(100) NOT NULL,
	"email" varchar(120),
	"whatsapp" varchar(30),
	"wechat" varchar(50),
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"designation" varchar(20),
	"phone" varchar(20)
);
CREATE TABLE "container" (
	"cont_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "container_cont_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"inq_id" bigint,
	"com_id" bigint,
	"container_type" varchar(20),
	"qty" integer,
	"destination" varchar(10) NOT NULL,
	"zip_code" varchar(15),
	"is_fully_loaded" boolean DEFAULT false,
	"free_time" varchar(50),
	"temperature" numeric(5, 2),
	"address" varchar(100),
	CONSTRAINT "container_qty_check" CHECK (((qty IS NULL) OR (qty > 0)))
);
CREATE TABLE "contracted_customer_group" (
	"crate_id" bigint,
	"cli_id" bigint,
	CONSTRAINT "contracted_customer_group_pkey" PRIMARY KEY("crate_id","cli_id")
);
CREATE TABLE "contracted_rates" (
	"crate_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contracted_rates_crate_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"lin_id" bigint NOT NULL,
	"tr_ln_id" bigint,
	"inq_id" bigint,
	"contract_ref_id" varchar(50),
	"valid_from" date,
	"valid_to" date,
	"contracted_volume" integer,
	"iwe" varchar(30),
	"container_type" varchar(20),
	"transit" varchar(50),
	"updated_by" bigint,
	"origin" varchar(10),
	"destination" varchar(10),
	"free_time" varchar(50),
	"max_weight" integer,
	"note" varchar(50),
	"special_remark" varchar(100),
	"currency" varchar(5),
	"rate" numeric(12, 2),
	"emp_id_sales" bigint,
	"emp_id_cs" bigint,
	"remaining_volume" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emp_id" bigint,
	CONSTRAINT "contracted_rates_check" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)))
);
CREATE TABLE "document_checklist" (
	"kyc_id" bigint NOT NULL,
	"doc_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_checklist_doc_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cli_id" bigint NOT NULL,
	"br_form" varchar(200),
	"vat_certificate" varchar(200),
	"svat_certificate" varchar(200),
	"tin_certificate" varchar(200),
	"form20" varchar(200)
);
CREATE TABLE "employee" (
	"emp_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "employee_emp_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"desig" varchar(80),
	"dept" varchar(80)
);
CREATE TABLE "employee_nac_access" (
	"emp_id" bigint,
	"nac_id" bigint,
	CONSTRAINT "employee_nac_access_pkey" PRIMARY KEY("emp_id","nac_id")
);
CREATE TABLE "fak_rates" (
	"fak_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fak_rates_fak_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"lin_id" bigint NOT NULL,
	"tr_ln_id" bigint,
	"valid_from" date,
	"valid_to" date,
	"volume" integer,
	"iwe" varchar(30),
	"container_type" varchar(20),
	"transit" varchar(50),
	"emp_id" bigint,
	"origin" varchar(10),
	"destination" varchar(10),
	"free_time" varchar(50),
	"max_weight" integer,
	"note" varchar(50),
	"special_remark" varchar(100),
	"rate" numeric(12, 2),
	"currency" varchar(5),
	"issold" boolean,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inq_id" bigint,
	CONSTRAINT "fak_rates_check" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)))
);
CREATE TABLE "fine_charge" (
	"inq_id" bigint,
	"char_id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "fine_charge_char_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(100),
	"amt" numeric(12, 2),
	"remark" text,
	CONSTRAINT "fine_charge_pkey" PRIMARY KEY("inq_id","char_id")
);
CREATE TABLE "inquiry" (
	"inq_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inquiry_inq_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cpid" bigint,
	"cli_id" bigint,
	"emp_id" bigint,
	"sbu" varchar(40),
	"remark" text,
	"origin" varchar(10) NOT NULL,
	"incoterm" varchar(50),
	"cargo_ready_date" date,
	"priority" varchar(20),
	"preferred_liners" text,
	"service_mode" varchar(15),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"updated_by" bigint,
	"address" varchar(50),
	"preferred_rate" numeric(12, 2),
	CONSTRAINT "inquiry_service_mode_check" CHECK (((service_mode)::text = ANY ((ARRAY['DOOR_TO_DOOR'::character varying, 'PORT_TO_PORT'::character varying])::text[])))
);
CREATE TABLE "kyc_request" (
	"kyc_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kyc_request_kyc_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cli_id" bigint NOT NULL,
	"br_number" varchar(50) NOT NULL,
	"parent_organization" varchar(150),
	"emp_id" bigint NOT NULL,
	"emp_id_sales" bigint,
	"emp_id_cs" bigint,
	"document_submission_deadline" date NOT NULL,
	"cli_type" varchar(50) NOT NULL,
	"currency" varchar(5) NOT NULL,
	"website" varchar(200),
	"svat_no" varchar(50),
	"tax_exemptions" text NOT NULL,
	"sea_imports" boolean DEFAULT false,
	"sea_exports" boolean DEFAULT false,
	"trade_lanes" boolean DEFAULT false,
	"forwarding" boolean DEFAULT false,
	"cross_trade" boolean DEFAULT false,
	"air_imports" boolean DEFAULT false,
	"air_exports" boolean DEFAULT false,
	"general_cargo" boolean DEFAULT false,
	"dangerous_goods" boolean DEFAULT false,
	"perishable_goods" boolean DEFAULT false,
	"updated_by" bigint
);
CREATE TABLE "liner" (
	"lin_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "liner_lin_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(100),
	"is_on_intra" boolean DEFAULT false,
	"has_portal" boolean DEFAULT false
);
CREATE TABLE "liner_trade_lane" (
	"lin_id" bigint,
	"tr_ln_id" bigint,
	CONSTRAINT "liner_trade_lane_pkey" PRIMARY KEY("lin_id","tr_ln_id")
);
CREATE TABLE "nac" (
	"nac_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nac_nac_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cli_id" bigint,
	"cpid" bigint,
	"emp_id" bigint,
	"tr_ln_id" bigint,
	"nac_ref_id" varchar(50),
	"origin" varchar(80),
	"destination" varchar(10),
	"valid_from" date,
	"valid_to" date,
	"rate" numeric(12, 2),
	"transit" varchar(50),
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lin_id" bigint,
	"free_time" varchar(50),
	"container_type" varchar(20),
	"remaining_volume" integer,
	"max_weight" integer,
	"currency" varchar(5),
	"note" varchar(50),
	"special_remark" varchar(100),
	"iwe" varchar(30),
	"contracted_volume" integer,
	"emp_id_sales" bigint,
	"emp_id_cs" bigint,
	CONSTRAINT "nac_check" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)))
);
CREATE TABLE "port" (
	"unlocode" varchar(10) PRIMARY KEY,
	"name" varchar(100) NOT NULL,
	"country" varchar(60)
);
CREATE TABLE "port_pair" (
	"pol_id" varchar(10),
	"pod_id" varchar(10),
	"tr_ln_id" bigint,
	"is_bookable" boolean DEFAULT true,
	CONSTRAINT "port_pair_pkey" PRIMARY KEY("pol_id","pod_id"),
	CONSTRAINT "port_pair_check" CHECK (((pol_id)::text <> (pod_id)::text))
);
CREATE TABLE "quotation" (
	"quote_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quotation_quote_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"inq_id" bigint NOT NULL,
	"emp_id" bigint,
	"status" varchar(30),
	"quote_date" date DEFAULT CURRENT_DATE,
	"is_follow_up" boolean DEFAULT false,
	"acceptance_deadline" date,
	"sent_via" varchar(30)
);
CREATE TABLE "quotation_option" (
	"option_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quotation_option_option_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"quote_id" bigint NOT NULL,
	"rate" numeric(12, 2),
	"remark" text
);
CREATE TABLE "rate_request" (
	"request_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rate_request_request_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"emp_id_requester" bigint NOT NULL,
	"emp_id_requested" bigint NOT NULL,
	"is_given" boolean DEFAULT false,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint
);
CREATE TABLE "rate_request_option" (
	"option_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rate_request_option_option_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"request_id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rate_type" varchar(20) NOT NULL,
	"rate_id" bigint NOT NULL,
	"updated_by" bigint,
	CONSTRAINT "rate_request_option_rate_type_check" CHECK (((rate_type)::text = ANY ((ARRAY['nac'::character varying, 'contracted_rates'::character varying, 'tariff_rates'::character varying, 'fak_rates'::character varying, 'special_rate'::character varying, 'vessel_by_vessel_rate'::character varying])::text[])))
);
CREATE TABLE "special_rate" (
	"sprid" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "special_rate_sprid_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"inq_id" bigint NOT NULL,
	"com_id" bigint NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"rate" numeric(12, 2),
	"transit" varchar(50),
	"lin_id" bigint,
	"origin" varchar(10),
	"destination" varchar(10),
	"tr_ln_id" bigint,
	"iwe" varchar(30),
	"emp_id" bigint,
	"free_days" varchar(50),
	"container_type" varchar(20),
	"volume" integer,
	"max_weight" integer,
	"currency" varchar(5),
	"note" varchar(50),
	"special_remark" varchar(100),
	"issold" boolean,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "special_rate_check" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)))
);
CREATE TABLE "surcharge" (
	"sur_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "surcharge_sur_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"inq_id" bigint NOT NULL,
	"type" varchar(50),
	"amt" numeric(12, 2),
	"currency" char(3)
);
CREATE TABLE "tariff_rates" (
	"tar_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tariff_rates_tar_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"lin_id" bigint NOT NULL,
	"tr_ln_id" bigint,
	"emp_id_cs" bigint,
	"origin" varchar(10),
	"destination" varchar(10),
	"free_time" varchar(50),
	"valid_from" date,
	"valid_to" date,
	"max_weight" integer,
	"iwe" varchar(30),
	"container_type" varchar(20),
	"rate" numeric(12, 2),
	"currency" varchar(5),
	"transit" varchar(50),
	"note" varchar(50),
	"special_remark" varchar(100),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint,
	"emp_id_sales" bigint,
	"emp_id" bigint,
	CONSTRAINT "tariff_rates_check" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from))),
	CONSTRAINT "tariff_rates_check1" CHECK (((origin)::text <> (destination)::text))
);
CREATE TABLE "trade_lane" (
	"tr_ln_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trade_lane_tr_ln_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tr_ln_name" varchar(100) NOT NULL
);
CREATE TABLE "trade_lane_assignment" (
	"tr_ln_id" bigint,
	"emp_id_assigned" bigint,
	"assigned_date" date DEFAULT CURRENT_DATE,
	CONSTRAINT "trade_lane_assignment_pkey" PRIMARY KEY("tr_ln_id","emp_id_assigned")
);
CREATE TABLE "vessel_by_vessel_rate" (
	"srid" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vessel_by_vessel_rate_srid_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"inq_id" bigint NOT NULL,
	"voyage" varchar(40) NOT NULL,
	"vessel_name" varchar(100) NOT NULL,
	"eta" date,
	"etd" date,
	"rate" numeric(12, 2),
	"fcl_opening" timestamp with time zone,
	"fcl_cutoff" timestamp with time zone,
	"origin" varchar(10),
	"destination" varchar(10),
	"tr_ln_id" bigint,
	"iwe" varchar(30),
	"emp_id" bigint,
	"free_days" varchar(50),
	"container_type" varchar(20),
	"volume" integer,
	"max_weight" integer,
	"currency" varchar(5),
	"note" varchar(50),
	"special_remark" varchar(100),
	"issold" boolean,
	"iscancelled" boolean,
	"cancellationreason" varchar(30),
	"cancellationfee" numeric(12, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint
);
CREATE TABLE "workflow_stats" (
	"inq_id" bigint NOT NULL,
	"flow_id" bigint,
	"stage" varchar(30)
);
CREATE TABLE "zip_code" (
	"zip" varchar(15) PRIMARY KEY,
	"region_state" varchar(80),
	"tr_ln_id" bigint,
	"port_id" varchar(10)
);
CREATE UNIQUE INDEX "client_pkey" ON "client" ("cli_id");
CREATE UNIQUE INDEX "commodity_pkey" ON "commodity" ("com_id");
CREATE INDEX "idx_commodity_inquiry" ON "commodity" ("inq_id");
CREATE UNIQUE INDEX "cont_rt_assignment_pkey" ON "cont_rt_assignment" ("fak_id","inq_id");
CREATE UNIQUE INDEX "contact_person_pkey" ON "contact_person" ("cpid");
CREATE INDEX "idx_contact_person_client" ON "contact_person" ("cli_id");
CREATE UNIQUE INDEX "container_pkey" ON "container" ("cont_id");
CREATE INDEX "idx_container_commodity" ON "container" ("com_id");
CREATE INDEX "idx_container_inquiry" ON "container" ("inq_id");
CREATE UNIQUE INDEX "contracted_customer_group_pkey" ON "contracted_customer_group" ("crate_id","cli_id");
CREATE UNIQUE INDEX "contracted_rates_pkey" ON "contracted_rates" ("crate_id");
CREATE INDEX "idx_contracted_rates_inq" ON "contracted_rates" ("inq_id");
CREATE INDEX "idx_contracted_rates_liner" ON "contracted_rates" ("lin_id");
CREATE UNIQUE INDEX "document_checklist_pkey" ON "document_checklist" ("doc_id");
CREATE UNIQUE INDEX "employee_pkey" ON "employee" ("emp_id");
CREATE UNIQUE INDEX "employee_nac_access_pkey" ON "employee_nac_access" ("emp_id","nac_id");
CREATE UNIQUE INDEX "fak_rates_pkey" ON "fak_rates" ("fak_id");
CREATE INDEX "idx_fak_rates_liner" ON "fak_rates" ("lin_id");
CREATE INDEX "idx_fak_rates_tradelane" ON "fak_rates" ("tr_ln_id");
CREATE UNIQUE INDEX "fine_charge_pkey" ON "fine_charge" ("inq_id","char_id");
CREATE INDEX "idx_inquiry_client" ON "inquiry" ("cli_id");
CREATE INDEX "idx_inquiry_contact" ON "inquiry" ("cpid");
CREATE INDEX "idx_inquiry_employee" ON "inquiry" ("emp_id");
CREATE UNIQUE INDEX "inquiry_pkey" ON "inquiry" ("inq_id");
CREATE UNIQUE INDEX "kyc_request_pkey" ON "kyc_request" ("kyc_id");
CREATE UNIQUE INDEX "liner_pkey" ON "liner" ("lin_id");
CREATE UNIQUE INDEX "liner_trade_lane_pkey" ON "liner_trade_lane" ("lin_id","tr_ln_id");
CREATE INDEX "idx_nac_client" ON "nac" ("cli_id");
CREATE UNIQUE INDEX "nac_pkey" ON "nac" ("nac_id");
CREATE UNIQUE INDEX "port_pkey" ON "port" ("unlocode");
CREATE INDEX "idx_port_pair_tradelane" ON "port_pair" ("tr_ln_id");
CREATE UNIQUE INDEX "port_pair_pkey" ON "port_pair" ("pol_id","pod_id");
CREATE INDEX "idx_quotation_employee" ON "quotation" ("emp_id");
CREATE INDEX "idx_quotation_inquiry" ON "quotation" ("inq_id");
CREATE UNIQUE INDEX "quotation_pkey" ON "quotation" ("quote_id");
CREATE UNIQUE INDEX "quotation_option_pkey" ON "quotation_option" ("option_id");
CREATE UNIQUE INDEX "rate_request_pkey" ON "rate_request" ("request_id");
CREATE UNIQUE INDEX "rate_request_option_pkey" ON "rate_request_option" ("option_id");
CREATE UNIQUE INDEX "special_rate_pkey" ON "special_rate" ("sprid");
CREATE INDEX "idx_surcharge_inquiry" ON "surcharge" ("inq_id");
CREATE UNIQUE INDEX "surcharge_pkey" ON "surcharge" ("sur_id");
CREATE UNIQUE INDEX "tariff_rates_pkey" ON "tariff_rates" ("tar_id");
CREATE UNIQUE INDEX "trade_lane_pkey" ON "trade_lane" ("tr_ln_id");
CREATE UNIQUE INDEX "trade_lane_assignment_pkey" ON "trade_lane_assignment" ("tr_ln_id","emp_id_assigned");
CREATE UNIQUE INDEX "vessel_by_vessel_rate_pkey" ON "vessel_by_vessel_rate" ("srid");
CREATE INDEX "idx_zip_code_port" ON "zip_code" ("port_id");
CREATE INDEX "idx_zip_code_tradelane" ON "zip_code" ("tr_ln_id");
CREATE UNIQUE INDEX "zip_code_pkey" ON "zip_code" ("zip");
ALTER TABLE "client" ADD CONSTRAINT "client_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "employee"("emp_id");
ALTER TABLE "client" ADD CONSTRAINT "client_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "client" ADD CONSTRAINT "client_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "commodity" ADD CONSTRAINT "commodity_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id") ON DELETE CASCADE;
ALTER TABLE "cont_rt_assignment" ADD CONSTRAINT "cont_rt_assignment_fak_id_fkey" FOREIGN KEY ("fak_id") REFERENCES "fak_rates"("fak_id");
ALTER TABLE "cont_rt_assignment" ADD CONSTRAINT "cont_rt_assignment_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id") ON DELETE CASCADE;
ALTER TABLE "contact_person" ADD CONSTRAINT "contact_person_cli_id_fkey" FOREIGN KEY ("cli_id") REFERENCES "client"("cli_id") ON DELETE CASCADE;
ALTER TABLE "contact_person" ADD CONSTRAINT "contact_person_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "contact_person" ADD CONSTRAINT "contact_person_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "container" ADD CONSTRAINT "container_com_id_fkey" FOREIGN KEY ("com_id") REFERENCES "commodity"("com_id");
ALTER TABLE "container" ADD CONSTRAINT "container_destination_fkey" FOREIGN KEY ("destination") REFERENCES "port"("unlocode");
ALTER TABLE "container" ADD CONSTRAINT "container_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id") ON DELETE CASCADE;
ALTER TABLE "container" ADD CONSTRAINT "container_zip_code_fkey" FOREIGN KEY ("zip_code") REFERENCES "zip_code"("zip");
ALTER TABLE "contracted_customer_group" ADD CONSTRAINT "contracted_customer_group_cli_id_fkey" FOREIGN KEY ("cli_id") REFERENCES "client"("cli_id");
ALTER TABLE "contracted_customer_group" ADD CONSTRAINT "contracted_customer_group_crate_id_fkey" FOREIGN KEY ("crate_id") REFERENCES "contracted_rates"("crate_id");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "cont_cs_emp_id_fk" FOREIGN KEY ("emp_id_cs") REFERENCES "employee"("emp_id");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "cont_emp_id_fk" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "cont_sales_emp_id_fk" FOREIGN KEY ("emp_id_sales") REFERENCES "employee"("emp_id");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "contracted_rates_destination_fkey" FOREIGN KEY ("destination") REFERENCES "port"("unlocode");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "contracted_rates_emp_id_cs_fkey" FOREIGN KEY ("emp_id_cs") REFERENCES "employee"("emp_id");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "contracted_rates_emp_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "contracted_rates_emp_id_fkey1" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "contracted_rates_emp_id_sales_fkey" FOREIGN KEY ("emp_id_sales") REFERENCES "employee"("emp_id");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "contracted_rates_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id") ON DELETE CASCADE;
ALTER TABLE "contracted_rates" ADD CONSTRAINT "contracted_rates_lin_id_fkey" FOREIGN KEY ("lin_id") REFERENCES "liner"("lin_id");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "contracted_rates_origin_fkey" FOREIGN KEY ("origin") REFERENCES "port"("unlocode");
ALTER TABLE "contracted_rates" ADD CONSTRAINT "contracted_rates_tr_ln_id_fkey" FOREIGN KEY ("tr_ln_id") REFERENCES "trade_lane"("tr_ln_id");
ALTER TABLE "document_checklist" ADD CONSTRAINT "document_checklist_cli_id_fkey" FOREIGN KEY ("cli_id") REFERENCES "client"("cli_id") ON DELETE CASCADE;
ALTER TABLE "document_checklist" ADD CONSTRAINT "document_checklist_kyc_id_fkey" FOREIGN KEY ("kyc_id") REFERENCES "kyc_request"("kyc_id") ON DELETE CASCADE;
ALTER TABLE "employee_nac_access" ADD CONSTRAINT "employee_nac_access_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id") ON DELETE CASCADE;
ALTER TABLE "employee_nac_access" ADD CONSTRAINT "employee_nac_access_nac_id_fkey" FOREIGN KEY ("nac_id") REFERENCES "nac"("nac_id") ON DELETE CASCADE;
ALTER TABLE "fak_rates" ADD CONSTRAINT "fak_rates_destination_fkey" FOREIGN KEY ("destination") REFERENCES "port"("unlocode");
ALTER TABLE "fak_rates" ADD CONSTRAINT "fak_rates_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "fak_rates" ADD CONSTRAINT "fak_rates_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id");
ALTER TABLE "fak_rates" ADD CONSTRAINT "fak_rates_lin_id_fkey" FOREIGN KEY ("lin_id") REFERENCES "liner"("lin_id");
ALTER TABLE "fak_rates" ADD CONSTRAINT "fak_rates_origin_fkey" FOREIGN KEY ("origin") REFERENCES "port"("unlocode");
ALTER TABLE "fak_rates" ADD CONSTRAINT "fak_rates_tr_ln_id_fkey" FOREIGN KEY ("tr_ln_id") REFERENCES "trade_lane"("tr_ln_id");
ALTER TABLE "fak_rates" ADD CONSTRAINT "fak_rates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "fine_charge" ADD CONSTRAINT "fine_charge_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id") ON DELETE CASCADE;
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_cli_id_fkey" FOREIGN KEY ("cli_id") REFERENCES "client"("cli_id");
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_cpid_fkey" FOREIGN KEY ("cpid") REFERENCES "contact_person"("cpid");
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_origin_fkey" FOREIGN KEY ("origin") REFERENCES "port"("unlocode");
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "kyc_request" ADD CONSTRAINT "kyc_request_cli_id_fkey" FOREIGN KEY ("cli_id") REFERENCES "client"("cli_id") ON DELETE CASCADE;
ALTER TABLE "kyc_request" ADD CONSTRAINT "kyc_request_emp_id_cs_fkey" FOREIGN KEY ("emp_id_cs") REFERENCES "employee"("emp_id");
ALTER TABLE "kyc_request" ADD CONSTRAINT "kyc_request_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "kyc_request" ADD CONSTRAINT "kyc_request_emp_id_sales_fkey" FOREIGN KEY ("emp_id_sales") REFERENCES "employee"("emp_id");
ALTER TABLE "kyc_request" ADD CONSTRAINT "kyc_request_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "liner_trade_lane" ADD CONSTRAINT "liner_trade_lane_lin_id_fkey" FOREIGN KEY ("lin_id") REFERENCES "liner"("lin_id") ON DELETE CASCADE;
ALTER TABLE "liner_trade_lane" ADD CONSTRAINT "liner_trade_lane_tr_ln_id_fkey" FOREIGN KEY ("tr_ln_id") REFERENCES "trade_lane"("tr_ln_id") ON DELETE CASCADE;
ALTER TABLE "nac" ADD CONSTRAINT "nac_cli_id_fkey" FOREIGN KEY ("cli_id") REFERENCES "client"("cli_id");
ALTER TABLE "nac" ADD CONSTRAINT "nac_cpid_fkey" FOREIGN KEY ("cpid") REFERENCES "contact_person"("cpid");
ALTER TABLE "nac" ADD CONSTRAINT "nac_destination_fkey" FOREIGN KEY ("destination") REFERENCES "port"("unlocode");
ALTER TABLE "nac" ADD CONSTRAINT "nac_emp_id_cs_fkey" FOREIGN KEY ("emp_id_cs") REFERENCES "employee"("emp_id");
ALTER TABLE "nac" ADD CONSTRAINT "nac_emp_id_fk" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "nac" ADD CONSTRAINT "nac_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "nac" ADD CONSTRAINT "nac_emp_id_sales_fkey" FOREIGN KEY ("emp_id_sales") REFERENCES "employee"("emp_id");
ALTER TABLE "nac" ADD CONSTRAINT "nac_lin_id_fkey" FOREIGN KEY ("lin_id") REFERENCES "liner"("lin_id");
ALTER TABLE "nac" ADD CONSTRAINT "nac_tr_ln_id_fkey" FOREIGN KEY ("tr_ln_id") REFERENCES "trade_lane"("tr_ln_id");
ALTER TABLE "nac" ADD CONSTRAINT "nac_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "port_pair" ADD CONSTRAINT "port_pair_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "port"("unlocode");
ALTER TABLE "port_pair" ADD CONSTRAINT "port_pair_pol_id_fkey" FOREIGN KEY ("pol_id") REFERENCES "port"("unlocode");
ALTER TABLE "port_pair" ADD CONSTRAINT "port_pair_tr_ln_id_fkey" FOREIGN KEY ("tr_ln_id") REFERENCES "trade_lane"("tr_ln_id");
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id") ON DELETE CASCADE;
ALTER TABLE "quotation_option" ADD CONSTRAINT "quotation_option_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotation"("quote_id") ON DELETE CASCADE;
ALTER TABLE "rate_request" ADD CONSTRAINT "rate_request_emp_id_requested_fkey" FOREIGN KEY ("emp_id_requested") REFERENCES "employee"("emp_id");
ALTER TABLE "rate_request" ADD CONSTRAINT "rate_request_emp_id_requester_fkey" FOREIGN KEY ("emp_id_requester") REFERENCES "employee"("emp_id");
ALTER TABLE "rate_request" ADD CONSTRAINT "rate_request_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "rate_request_option" ADD CONSTRAINT "rate_request_option_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "rate_request"("request_id") ON DELETE CASCADE;
ALTER TABLE "rate_request_option" ADD CONSTRAINT "rate_request_option_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "special_rate" ADD CONSTRAINT "special_rate_com_id_fkey" FOREIGN KEY ("com_id") REFERENCES "commodity"("com_id") ON DELETE CASCADE;
ALTER TABLE "special_rate" ADD CONSTRAINT "special_rate_destination_fkey" FOREIGN KEY ("destination") REFERENCES "port"("unlocode");
ALTER TABLE "special_rate" ADD CONSTRAINT "special_rate_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "special_rate" ADD CONSTRAINT "special_rate_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id") ON DELETE CASCADE;
ALTER TABLE "special_rate" ADD CONSTRAINT "special_rate_lin_id_fkey" FOREIGN KEY ("lin_id") REFERENCES "liner"("lin_id");
ALTER TABLE "special_rate" ADD CONSTRAINT "special_rate_origin_fkey" FOREIGN KEY ("origin") REFERENCES "port"("unlocode");
ALTER TABLE "special_rate" ADD CONSTRAINT "special_rate_tr_ln_id_fkey" FOREIGN KEY ("tr_ln_id") REFERENCES "trade_lane"("tr_ln_id");
ALTER TABLE "special_rate" ADD CONSTRAINT "special_rate_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "surcharge" ADD CONSTRAINT "surcharge_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id") ON DELETE CASCADE;
ALTER TABLE "tariff_rates" ADD CONSTRAINT "cs_emp_id_fk" FOREIGN KEY ("emp_id_cs") REFERENCES "employee"("emp_id");
ALTER TABLE "tariff_rates" ADD CONSTRAINT "sales_emp_id_fk" FOREIGN KEY ("emp_id_sales") REFERENCES "employee"("emp_id");
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tar_emp_id_fk" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_destination_fkey" FOREIGN KEY ("destination") REFERENCES "port"("unlocode");
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_emp_id_fkey" FOREIGN KEY ("emp_id_cs") REFERENCES "employee"("emp_id");
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_emp_id_fkey1" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_emp_id_sales_fkey" FOREIGN KEY ("emp_id_sales") REFERENCES "employee"("emp_id");
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_lin_id_fkey" FOREIGN KEY ("lin_id") REFERENCES "liner"("lin_id");
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_origin_fkey" FOREIGN KEY ("origin") REFERENCES "port"("unlocode");
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_tr_ln_id_fkey" FOREIGN KEY ("tr_ln_id") REFERENCES "trade_lane"("tr_ln_id");
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "trade_lane_assignment" ADD CONSTRAINT "trade_lane_assignment_emp_id_assigned_fkey" FOREIGN KEY ("emp_id_assigned") REFERENCES "employee"("emp_id");
ALTER TABLE "trade_lane_assignment" ADD CONSTRAINT "trade_lane_assignment_tr_ln_id_fkey" FOREIGN KEY ("tr_ln_id") REFERENCES "trade_lane"("tr_ln_id");
ALTER TABLE "vessel_by_vessel_rate" ADD CONSTRAINT "vessel_by_vessel_rate_destination_fkey" FOREIGN KEY ("destination") REFERENCES "port"("unlocode");
ALTER TABLE "vessel_by_vessel_rate" ADD CONSTRAINT "vessel_by_vessel_rate_emp_id_fkey" FOREIGN KEY ("emp_id") REFERENCES "employee"("emp_id");
ALTER TABLE "vessel_by_vessel_rate" ADD CONSTRAINT "vessel_by_vessel_rate_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id") ON DELETE CASCADE;
ALTER TABLE "vessel_by_vessel_rate" ADD CONSTRAINT "vessel_by_vessel_rate_origin_fkey" FOREIGN KEY ("origin") REFERENCES "port"("unlocode");
ALTER TABLE "vessel_by_vessel_rate" ADD CONSTRAINT "vessel_by_vessel_rate_tr_ln_id_fkey" FOREIGN KEY ("tr_ln_id") REFERENCES "trade_lane"("tr_ln_id");
ALTER TABLE "vessel_by_vessel_rate" ADD CONSTRAINT "vessel_by_vessel_rate_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employee"("emp_id");
ALTER TABLE "workflow_stats" ADD CONSTRAINT "workflow_stats_inq_id_fkey" FOREIGN KEY ("inq_id") REFERENCES "inquiry"("inq_id");
ALTER TABLE "zip_code" ADD CONSTRAINT "zip_code_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "port"("unlocode");
ALTER TABLE "zip_code" ADD CONSTRAINT "zip_code_tr_ln_id_fkey" FOREIGN KEY ("tr_ln_id") REFERENCES "trade_lane"("tr_ln_id");