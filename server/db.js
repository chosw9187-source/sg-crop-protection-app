// PostgreSQL 연결 및 스키마 초기화
// 주의: 이 앱 전용 데이터베이스를 사용한다. 다른 프로젝트(hr-eval-system 등)와
// 같은 DB를 쓰면 그쪽 배포 파이프라인이 여기 테이블을 삭제할 수 있다.
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('환경변수 DATABASE_URL 이 없습니다. Railway에서 PostgreSQL을 추가하세요.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  // Railway 내부 연결은 TLS 검증이 필요 없다
  ssl: /railway|amazonaws|render/i.test(connectionString) ? { rejectUnauthorized: false } : false,
});

// 테이블이 없을 때만 만든다. 기존 데이터는 절대 건드리지 않는다.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  emp_no         TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  dept           TEXT DEFAULT '',
  pw_hash        TEXT NOT NULL,
  pw_salt        TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user',
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_pw BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS journal (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ts         TEXT NOT NULL,
  q          TEXT NOT NULL,
  a          TEXT NOT NULL DEFAULT '',
  memo       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS journal_user_idx ON journal(user_id, id DESC);

CREATE TABLE IF NOT EXISTS chat (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  q          TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_user_idx ON chat(user_id, id);

CREATE TABLE IF NOT EXISTS quiz_stat (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  correct INTEGER NOT NULL DEFAULT 0,
  total   INTEGER NOT NULL DEFAULT 0
);
`;

async function init() {
  await pool.query(SCHEMA);
  // 만료된 세션 정리
  await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
  console.log('[db] 스키마 준비 완료');
}

module.exports = { pool, init };
