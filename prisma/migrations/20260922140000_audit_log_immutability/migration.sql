-- Create immutability function
CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is immutable: UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

-- Create trigger BEFORE UPDATE OR DELETE
CREATE TRIGGER audit_log_immutable_trigger
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
