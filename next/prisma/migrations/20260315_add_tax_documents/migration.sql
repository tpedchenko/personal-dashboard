-- CreateTable: tax_documents
CREATE TABLE IF NOT EXISTS "tax_documents" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "country" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "source" TEXT,
    "period" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "file_name" TEXT,
    "parsed_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: tax_simulations
CREATE TABLE IF NOT EXISTS "tax_simulations" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "regime" TEXT NOT NULL,
    "input_json" TEXT NOT NULL,
    "result_json" TEXT NOT NULL,
    "comunidad" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tax_documents_user_id_country_year_idx" ON "tax_documents"("user_id", "country", "year");
CREATE UNIQUE INDEX IF NOT EXISTS "tax_documents_user_id_country_doc_type_period_source_key" ON "tax_documents"("user_id", "country", "doc_type", "period", "source");

CREATE INDEX IF NOT EXISTS "tax_simulations_user_id_year_idx" ON "tax_simulations"("user_id", "year");
CREATE UNIQUE INDEX IF NOT EXISTS "tax_simulations_user_id_year_regime_key" ON "tax_simulations"("user_id", "year", "regime");
