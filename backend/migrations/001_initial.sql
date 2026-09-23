CREATE TYPE legal_status AS ENUM ('DRAFT', 'PENDING_EFFECT', 'ACTIVE', 'PARTIALLY_REPEALED', 'REPEALED', 'SUSPENDED', 'UNVERIFIED');
CREATE TYPE review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_code TEXT UNIQUE NOT NULL,
  reference_number TEXT,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  issuing_authority TEXT,
  issued_on DATE,
  effective_on DATE,
  expires_on DATE,
  legal_status legal_status NOT NULL DEFAULT 'UNVERIFIED',
  applicability TEXT NOT NULL DEFAULT 'UNVERIFIED',
  primary_domain TEXT,
  departments TEXT[] NOT NULL DEFAULT '{}',
  source_url TEXT,
  source_file_path TEXT,
  source_sha256 TEXT,
  verification_level TEXT NOT NULL DEFAULT 'UNVERIFIED',
  last_checked_at TIMESTAMPTZ,
  review_state review_status NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX documents_source_sha256_key ON documents(source_sha256) WHERE source_sha256 IS NOT NULL;
CREATE INDEX documents_status_index ON documents(legal_status, effective_on);
CREATE INDEX documents_last_checked_index ON documents(last_checked_at);

CREATE TABLE document_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('AMENDS', 'REPLACES', 'REPEALS', 'SUSPENDS', 'CONSOLIDATES', 'GUIDES')),
  target_provision TEXT,
  impact_scope TEXT,
  evidence_url TEXT,
  effective_from DATE,
  effective_to DATE,
  transitional_terms TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE impact_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  impact_level SMALLINT NOT NULL CHECK (impact_level BETWEEN 0 AND 3),
  finding TEXT NOT NULL,
  legal_basis TEXT,
  assessment_status review_status NOT NULL DEFAULT 'PENDING',
  assessed_by TEXT,
  assessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE implementation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  requirement TEXT NOT NULL,
  legal_basis TEXT,
  owner_department TEXT,
  legal_deadline DATE,
  internal_deadline DATE,
  priority SMALLINT CHECK (priority BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'OPEN',
  evidence_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('NEW_DOCUMENT', 'STATUS_CHANGED', 'EFFECTIVE_SOON', 'REVIEW_REQUIRED', 'CHECK_FAILED')),
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON implementation_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

