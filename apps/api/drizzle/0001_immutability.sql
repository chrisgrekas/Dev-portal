-- Οι εκδόσεις κώδικα είναι αμετάβλητες: κανένα UPDATE ή DELETE.
-- (Το TRUNCATE, που χρησιμοποιεί μόνο το seed σε dev, δεν ενεργοποιεί το trigger.)
CREATE OR REPLACE FUNCTION prevent_rule_version_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'rule_versions is immutable: create a new version instead';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER rule_versions_immutable
BEFORE UPDATE OR DELETE ON rule_versions
FOR EACH ROW EXECUTE FUNCTION prevent_rule_version_change();
