-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "mafftjob" (
    "id" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "inputFilename" TEXT NOT NULL,
    "inputData" BYTEA NOT NULL,
    "existingAlnData" BYTEA,
    "notifyEmail" TEXT,
    "submitted" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started" TIMESTAMP(3),
    "finished" TIMESTAMP(3),
    "err" TEXT,
    "stderr" TEXT,
    "summary" JSONB,
    "alignmentFasta" TEXT,
    "guideTreeNewick" TEXT,
    "resultsZip" BYTEA,
    "resultsZipBytes" INTEGER,

    CONSTRAINT "mafftjob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mafftjob_id_key" ON "mafftjob"("id");

