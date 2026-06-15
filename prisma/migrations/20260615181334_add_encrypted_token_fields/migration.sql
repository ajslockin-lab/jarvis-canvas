-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canvasAccessTokenEncrypted" TEXT,
ADD COLUMN     "canvasBaseUrl" TEXT,
ADD COLUMN     "canvasRefreshTokenEncrypted" TEXT,
ADD COLUMN     "canvasTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "canvasUserId" TEXT;
