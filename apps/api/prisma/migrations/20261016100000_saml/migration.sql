-- CreateEnum
CREATE TYPE "IdpProtocol" AS ENUM ('oidc', 'saml');

-- AlterTable
ALTER TABLE "identity_providers" ADD COLUMN     "email_attribute" TEXT NOT NULL DEFAULT 'email',
ADD COLUMN     "protocol" "IdpProtocol" NOT NULL DEFAULT 'oidc',
ADD COLUMN     "saml_certificate" TEXT,
ADD COLUMN     "saml_entry_point" TEXT,
ALTER COLUMN "client_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "saml_requests" (
    "id" TEXT NOT NULL,
    "return_to" TEXT NOT NULL DEFAULT '/',
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saml_requests_pkey" PRIMARY KEY ("id")
);

