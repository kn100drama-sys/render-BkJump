/*
  Warnings:

  - Added the required column `valorPorPlataforma` to the `Partida` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ResultadoPartida" AS ENUM ('GANHOU', 'PERDEU');

-- AlterTable
ALTER TABLE "Partida" ADD COLUMN     "dificuldade" TEXT,
ADD COLUMN     "plataformasPassadas" INTEGER DEFAULT 0,
ADD COLUMN     "resultado" "ResultadoPartida",
ADD COLUMN     "valorFinal" DOUBLE PRECISION,
ADD COLUMN     "valorPorPlataforma" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totalApostas" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Config" (
    "id" SERIAL NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Config_chave_key" ON "Config"("chave");

-- CreateIndex
CREATE INDEX "Deposito_userId_idx" ON "Deposito"("userId");

-- CreateIndex
CREATE INDEX "Deposito_status_idx" ON "Deposito"("status");

-- CreateIndex
CREATE INDEX "Partida_userId_idx" ON "Partida"("userId");

-- CreateIndex
CREATE INDEX "Partida_status_idx" ON "Partida"("status");

-- CreateIndex
CREATE INDEX "Saque_userId_idx" ON "Saque"("userId");

-- CreateIndex
CREATE INDEX "Saque_status_idx" ON "Saque"("status");

-- CreateIndex
CREATE INDEX "User_indicadoPor_idx" ON "User"("indicadoPor");
