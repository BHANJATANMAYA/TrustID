-- DigiID Verify — Government ID Documents Schema
-- Drop old student table, create new gov_documents table

DROP TABLE IF EXISTS students;

CREATE TABLE IF NOT EXISTS gov_documents (
  id           SERIAL PRIMARY KEY,
  doc_type     VARCHAR(10)  NOT NULL CHECK (doc_type IN ('aadhaar', 'pan', 'voter')),
  name         VARCHAR(100) NOT NULL,
  identity_no  VARCHAR(20)  NOT NULL UNIQUE,
  dob          DATE         NOT NULL,
  authority    VARCHAR(150) NOT NULL,
  address      TEXT,
  hash         CHAR(64)     NOT NULL,
  anchored_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gov_docs_identity ON gov_documents(identity_no);
CREATE INDEX IF NOT EXISTS idx_gov_docs_doc_type ON gov_documents(doc_type);
