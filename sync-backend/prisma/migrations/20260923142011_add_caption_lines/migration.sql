-- CreateTable
CREATE TABLE "caption_lines" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "speakerId" TEXT NOT NULL,
    "speakerName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "spokenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caption_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "caption_lines_callId_spokenAt_idx" ON "caption_lines"("callId", "spokenAt");

-- AddForeignKey
ALTER TABLE "caption_lines" ADD CONSTRAINT "caption_lines_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caption_lines" ADD CONSTRAINT "caption_lines_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
