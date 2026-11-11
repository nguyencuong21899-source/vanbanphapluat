CREATE TABLE legal_matters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('CASE','CHANGE','RESEARCH','REVIEW','DRAFT','KNOWLEDGE')),
  objective text NOT NULL,
  context text NOT NULL DEFAULT '',
  owner_id uuid NOT NULL REFERENCES accounts(id),
  department_id uuid REFERENCES departments(id),
  visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE','DEPARTMENT','COMPANY')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','APPROVED','CLOSED')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (visibility <> 'DEPARTMENT' OR department_id IS NOT NULL)
);
CREATE INDEX legal_matters_owner ON legal_matters(owner_id, department_id);
CREATE TABLE legal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES legal_matters(id),
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('LEGAL','INTERNAL','CONTRACT','EVIDENCE','PLAYBOOK')),
  source_url text,
  document_id uuid REFERENCES documents(id),
  content text NOT NULL DEFAULT '',
  digest text NOT NULL,
  file_path text,
  filename text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE legal_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES legal_matters(id),
  context_revision integer NOT NULL,
  result jsonb NOT NULL,
  source_snapshot jsonb NOT NULL,
  provider text NOT NULL,
  created_by uuid NOT NULL REFERENCES accounts(id),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by uuid REFERENCES accounts(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legal_reports_matter ON legal_reports(matter_id, created_at DESC);
CREATE TABLE legal_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES legal_matters(id),
  report_id uuid REFERENCES legal_reports(id),
  title text NOT NULL,
  legal_basis text NOT NULL DEFAULT '',
  assignee_id uuid NOT NULL REFERENCES accounts(id),
  due_on date NOT NULL,
  priority text NOT NULL CHECK (priority IN ('HIGH','MEDIUM','LOW')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','SUBMITTED','DONE')),
  evidence text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1,
  reviewed_by uuid REFERENCES accounts(id),
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legal_actions_due ON legal_actions(assignee_id,due_on);
