-- CreateTable
CREATE TABLE "login_failures" (
    "email" TEXT NOT NULL,
    "failed_at" BIGINT[],

    CONSTRAINT "login_failures_pkey" PRIMARY KEY ("email")
);

