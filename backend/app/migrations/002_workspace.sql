CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '',
  keywords text NOT NULL DEFAULT ''
);
INSERT INTO departments (name) VALUES
 ('Phòng Quản lý chất lượng'), ('Bộ phận Kiểm tra chất lượng (QC)'),
 ('Phòng Quản lý thiết bị'), ('Phòng Kế hoạch tổng hợp'), ('Phòng Tổng hợp');

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  display_name text NOT NULL,
  email text,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','legal','manager','employee')),
  department_id uuid REFERENCES departments(id),
  enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE sessions (
  digest text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE login_attempts (
  bucket text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE documents ADD COLUMN archived_at timestamptz,
 ADD COLUMN comment_deadline date, ADD COLUMN source_filename text;
ALTER TABLE implementation_plans ADD COLUMN assignee_id uuid REFERENCES accounts(id),
 ADD COLUMN department_id uuid REFERENCES departments(id);
CREATE TABLE ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id),
  actor text NOT NULL,
  provider text NOT NULL,
  file_digest text NOT NULL,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reminder_deliveries (
  task_id uuid NOT NULL REFERENCES implementation_plans(id),
  due_on date NOT NULL,
  days_before integer NOT NULL,
  state text NOT NULL CHECK (state IN ('SENDING','SENT','FAILED')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, due_on, days_before)
);
