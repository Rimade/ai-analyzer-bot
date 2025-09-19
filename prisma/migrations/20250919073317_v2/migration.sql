/*
  Warnings:

  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - Added the required column `updatedAt` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Subscription` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Analysis" ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "public"."Subscription" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Analysis_userId_idx" ON "public"."Analysis"("userId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "public"."Payment"("userId");
