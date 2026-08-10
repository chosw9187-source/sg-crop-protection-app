// 전 직원 공통 설정 변경 스크립트
//   node set_code.js                    현재 값 확인
//   node set_code.js SG1234             인증코드 변경
//   node set_code.js --admin 3030agro   관리자 비밀번호 변경
const fs = require('fs');
const path = require('path');

const cfgPath = path.join(__dirname, 'app_config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));

const a1 = (process.argv[2] || '').trim();
const a2 = (process.argv[3] || '').trim();

function save(label, key, val) {
  if (val.length < 4) {
    console.error('오류: ' + label + '은(는) 4자 이상이어야 합니다.');
    process.exit(1);
  }
  const old = cfg[key];
  cfg[key] = val;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
  console.log(label + ' 변경: ' + old + ' -> ' + val);
  console.log('');
  console.log('이제 아래 명령으로 배포하세요 (전 직원에게 적용됩니다):');
  console.log('');
  console.log('  node build_v2.js && git add -A && git commit -m "' + label + ' 변경" && git push');
  console.log('');
}

if (!a1) {
  console.log('현재 인증코드        :', cfg.accessCode);
  console.log('현재 관리자 비밀번호 :', cfg.adminPw);
  console.log('');
  console.log('변경하려면:');
  console.log('  node set_code.js 새코드');
  console.log('  node set_code.js --admin 새비밀번호');
} else if (a1 === '--admin') {
  if (!a2) { console.error('오류: 새 비밀번호를 입력하세요.  예) node set_code.js --admin 3030agro'); process.exit(1); }
  save('관리자 비밀번호', 'adminPw', a2);
} else {
  save('인증코드', 'accessCode', a1);
}
