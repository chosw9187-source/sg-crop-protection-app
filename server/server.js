// SG 한팀장 - 사내 전용 서버
//   - 로그인하지 않으면 앱 화면 자체가 내려가지 않는다
//   - 업무일지/대화/퀴즈 기록을 계정에 저장해 기기 간 동기화
//   - 관리자가 계정을 발급하고, 퇴사자는 비활성화로 즉시 차단
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { pool, init } = require('./db');
const {
  hashPassword, verifyPassword, createSession, destroySession,
  currentUser, requireLogin, requireAdmin,
} = require('./auth');

const app = express();
app.set('trust proxy', 1);              // Railway는 프록시 뒤에서 동작
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const PUBLIC = path.join(__dirname, 'public');

// ---------- 페이지 ----------
app.get('/login', async (req, res) => {
  if (await currentUser(req)) return res.redirect('/');
  res.sendFile(path.join(PUBLIC, 'login.html'));
});

// 앱 본체는 로그인한 사람에게만 전달한다.
// no-cache = 매번 서버에 물어보되 안 바뀌었으면 304로 재사용 → 항상 최신, 재다운로드 없음
app.get('/', requireLogin(true), (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

// ---------- 인증 ----------
app.post('/api/login', async (req, res) => {
  const empNo = String((req.body && req.body.empNo) || '').trim();
  const password = String((req.body && req.body.password) || '');
  if (!empNo || !password) return res.status(400).json({ error: '사번과 비밀번호를 입력하세요' });

  const { rows } = await pool.query(
    'SELECT id, pw_hash, pw_salt, active, name FROM users WHERE emp_no = $1', [empNo]
  );
  const u = rows[0];
  // 존재 여부를 노출하지 않도록 같은 메시지를 쓴다
  if (!u || !verifyPassword(password, u.pw_salt, u.pw_hash)) {
    return res.status(401).json({ error: '사번 또는 비밀번호가 올바르지 않습니다' });
  }
  if (!u.active) return res.status(403).json({ error: '비활성화된 계정입니다. 관리자에게 문의하세요' });

  await createSession(res, u.id);
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [u.id]);
  res.json({ ok: true, name: u.name });
});

app.post('/api/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

// 앱이 시작할 때 이걸 부른다. 응답이 오면 '서버 모드'로 동작한다.
app.get('/api/me', requireLogin(false), (req, res) => {
  res.json({
    empNo: req.user.emp_no, name: req.user.name, dept: req.user.dept,
    role: req.user.role, mustChangePw: req.user.must_change_pw,
  });
});

app.post('/api/password', requireLogin(false), async (req, res) => {
  const cur = String((req.body && req.body.current) || '');
  const next = String((req.body && req.body.next) || '');
  if (next.length < 6) return res.status(400).json({ error: '새 비밀번호는 6자 이상이어야 합니다' });

  const { rows } = await pool.query('SELECT pw_hash, pw_salt FROM users WHERE id = $1', [req.user.id]);
  if (!verifyPassword(cur, rows[0].pw_salt, rows[0].pw_hash)) {
    return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다' });
  }
  const { hash, salt } = hashPassword(next);
  await pool.query(
    'UPDATE users SET pw_hash = $1, pw_salt = $2, must_change_pw = FALSE WHERE id = $3',
    [hash, salt, req.user.id]
  );
  res.json({ ok: true });
});

// ---------- 기록 동기화 ----------
app.get('/api/data', requireLogin(false), async (req, res) => {
  const uid = req.user.id;
  const [j, c, q] = await Promise.all([
    pool.query('SELECT id, ts, q, a, memo FROM journal WHERE user_id = $1 ORDER BY id DESC LIMIT 500', [uid]),
    pool.query('SELECT role, text, q, kind FROM chat WHERE user_id = $1 ORDER BY id LIMIT 400', [uid]),
    pool.query('SELECT correct, total FROM quiz_stat WHERE user_id = $1', [uid]),
  ]);
  res.json({
    journal: j.rows.map(r => ({ id: String(r.id), ts: r.ts, q: r.q, a: r.a, memo: r.memo })),
    chat: c.rows,
    quiz: q.rows[0] || { correct: 0, total: 0 },
  });
});

app.post('/api/journal', requireLogin(false), async (req, res) => {
  const { ts, q, a } = req.body || {};
  const { rows } = await pool.query(
    'INSERT INTO journal (user_id, ts, q, a) VALUES ($1, $2, $3, $4) RETURNING id',
    [req.user.id, String(ts || ''), String(q || ''), String(a || '')]
  );
  res.json({ ok: true, id: String(rows[0].id) });
});

app.patch('/api/journal/:id', requireLogin(false), async (req, res) => {
  await pool.query('UPDATE journal SET memo = $1 WHERE id = $2 AND user_id = $3',
    [String((req.body && req.body.memo) || ''), req.params.id, req.user.id]);
  res.json({ ok: true });
});

app.delete('/api/journal/:id', requireLogin(false), async (req, res) => {
  await pool.query('DELETE FROM journal WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

app.delete('/api/journal', requireLogin(false), async (req, res) => {
  await pool.query('DELETE FROM journal WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
});

app.post('/api/chat', requireLogin(false), async (req, res) => {
  const msgs = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
  for (const m of msgs) {
    await pool.query(
      'INSERT INTO chat (user_id, role, text, q, kind) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, String(m.role || ''), String(m.text || ''), String(m.q || ''), String(m.kind || '')]
    );
  }
  res.json({ ok: true });
});

app.delete('/api/chat', requireLogin(false), async (req, res) => {
  await pool.query('DELETE FROM chat WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
});

app.post('/api/quiz', requireLogin(false), async (req, res) => {
  const correct = req.body && req.body.correct ? 1 : 0;
  await pool.query(
    `INSERT INTO quiz_stat (user_id, correct, total) VALUES ($1, $2, 1)
     ON CONFLICT (user_id) DO UPDATE
       SET correct = quiz_stat.correct + $2, total = quiz_stat.total + 1`,
    [req.user.id, correct]
  );
  res.json({ ok: true });
});

// ---------- 관리자: 계정 관리 ----------
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, emp_no, name, dept, role, active, must_change_pw, last_login_at
       FROM users ORDER BY active DESC, name`
  );
  res.json({ users: rows });
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const empNo = String((req.body && req.body.empNo) || '').trim();
  const name = String((req.body && req.body.name) || '').trim();
  const dept = String((req.body && req.body.dept) || '').trim();
  const password = String((req.body && req.body.password) || '').trim();
  const role = req.body && req.body.role === 'admin' ? 'admin' : 'user';
  if (!empNo || !name || password.length < 6) {
    return res.status(400).json({ error: '사번·이름·초기 비밀번호(6자 이상)를 입력하세요' });
  }
  const { hash, salt } = hashPassword(password);
  try {
    await pool.query(
      `INSERT INTO users (emp_no, name, dept, pw_hash, pw_salt, role, must_change_pw)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
      [empNo, name, dept, hash, salt, role]
    );
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '이미 등록된 사번입니다' });
    throw e;
  }
  res.json({ ok: true });
});

// 퇴사 처리: 계정을 끄고 세션을 즉시 끊는다
app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = req.body || {};
  if (typeof body.active === 'boolean') {
    await pool.query('UPDATE users SET active = $1 WHERE id = $2', [body.active, id]);
    if (!body.active) await pool.query('DELETE FROM sessions WHERE user_id = $1', [id]);
  }
  if (body.resetPassword) {
    const pw = String(body.resetPassword);
    if (pw.length < 6) return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다' });
    const { hash, salt } = hashPassword(pw);
    await pool.query(
      'UPDATE users SET pw_hash = $1, pw_salt = $2, must_change_pw = TRUE WHERE id = $3',
      [hash, salt, id]
    );
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [id]);
  }
  res.json({ ok: true });
});

// ---------- 정적 파일 ----------
// index.html은 위에서 인증을 거쳐 따로 내보내므로 여기서는 제외한다
app.use(express.static(PUBLIC, { index: false }));

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: '서버 오류가 발생했습니다' });
});

// ---------- 기동 ----------
const PORT = process.env.PORT || 3000;

// 환경변수로 지정한 관리자 계정을 보장한다.
// 이미 있으면 비밀번호를 그 값으로 맞춘다 → 관리자가 비밀번호를 잊어도 복구할 수 있다.
// 설정이 끝나면 ADMIN_PASSWORD 를 지우는 것을 권장한다(배포마다 덮어쓰지 않도록).
async function ensureAdmin() {
  const empNo = (process.env.ADMIN_EMP_NO || '').trim();
  const pw = process.env.ADMIN_PASSWORD;
  if (!empNo || !pw) {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
    if (rows[0].n === 0) {
      console.warn('[seed] 계정이 하나도 없습니다. ADMIN_EMP_NO / ADMIN_PASSWORD 를 설정하고 재배포하세요.');
    }
    return;
  }
  const { hash, salt } = hashPassword(pw);
  const { rows } = await pool.query('SELECT id FROM users WHERE emp_no = $1', [empNo]);
  if (rows[0]) {
    await pool.query(
      `UPDATE users SET pw_hash = $1, pw_salt = $2, role = 'admin', active = TRUE, must_change_pw = FALSE
        WHERE id = $3`,
      [hash, salt, rows[0].id]
    );
    console.log('[seed] 관리자 계정 갱신:', empNo);
  } else {
    await pool.query(
      `INSERT INTO users (emp_no, name, dept, pw_hash, pw_salt, role, must_change_pw)
       VALUES ($1, '관리자', '경영지원팀', $2, $3, 'admin', FALSE)`,
      [empNo, hash, salt]
    );
    console.log('[seed] 관리자 계정 생성:', empNo);
  }
}

init()
  .then(ensureAdmin)
  .then(() => app.listen(PORT, () => console.log('[server] 포트 ' + PORT + ' 에서 실행 중')))
  .catch((e) => { console.error('기동 실패:', e); process.exit(1); });
