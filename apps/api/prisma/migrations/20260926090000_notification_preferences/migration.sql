-- The settings screen's three switches were never stored anywhere: flipped
-- off, they came back on, and the bell went on ringing. What reaches the bell
-- is now kept on the account. On by default, so nobody hears less than before.
ALTER TABLE "User" ADD COLUMN "notifyEvents" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyComments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "defaultReminderMinutes" INTEGER;
