-- Free tags on an event.
--
-- A scalar array rather than a Tag table: a tag has no properties, no lifecycle
-- and no owner beyond the event it sits on. A join table would buy referential
-- integrity for something that is, correctly, just a word the family chose.
--
-- The category stays exactly as it was. The two are different axes — the
-- category is the closed life-cycle set the study calls a differentiator, the
-- tag is the family's own vocabulary.
ALTER TABLE "Event" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
