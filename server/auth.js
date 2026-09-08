// 비밀번호 해싱(scrypt)과 세션 관리
// scrypt는 Node 내장이라 별도 패키지가 필요 없고, 배포 환경을 타지 않는다.
const crypto = require('crypto');
const { pool } = require('./db');

const SESSION_DAYS = 30;
const COOKIE = 'sg_sid';

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, useSalt, 64).toString('hex');
  return { hash, salt: useSalt };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);   // 타이밍 공격 방지
}

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
    [token, userId, expires]
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,                                  // JS로 훔칠 수 없게
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires,
  });
  return token;
}

async function destroySession(req, res) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  res.clearCookie(COOKIE);
}

// 세션 → 사용자. 비활성 계정(퇴사자)은 즉시 차단된다.
async function currentUser(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.emp_no, u.name, u.dept, u.role, u.active, u.must_change_pw
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  const user = rows[0];
  if (!user || !user.active) return null;
  return user;
}

// 라우트 보호용 미들웨어
function requireLogin(redirectToLogin) {
  return async (req, res, next) => {
    const user = await currentUser(req);
    if (!user) {
      if (redirectToLogin) return res.redirect('/login');
      return res.status(401).json({ error: '로그인이 필요합니다' });
    }
    req.user = user;
    next();
  };
}

async function requireAdmin(req, res, next) {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다' });
  if (user.role !== 'admin') return res.status(403).json({ error: '관리자만 사용할 수 있습니다' });
  req.user = user;
  next();
}

module.exports = {
  COOKIE, hashPassword, verifyPassword,
  createSession, destroySession, currentUser,
  requireLogin, requireAdmin,
};
