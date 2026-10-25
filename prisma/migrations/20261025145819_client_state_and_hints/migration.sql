-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "mood" TEXT,
ADD COLUMN     "privateNotes" TEXT;

-- AlterTable
ALTER TABLE "PracticeSession" ADD COLUMN     "hintsUsed" INTEGER NOT NULL DEFAULT 0;
