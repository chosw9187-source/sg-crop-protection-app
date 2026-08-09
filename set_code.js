// 전 직원 공통 인증코드 변경 스크립트
//   사용법:  node set_code.js SG1234
// 실행 후 배포 명령을 안내합니다.
const fs = require('fs');
const path = require('path');

const newCode = (process.argv[2] || '').trim();
const cfgPath = path.join(__dirname, 'app_config.json');

if (!newCode) {
  const cur = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  console.log('현재 인증코드:', cur.accessCode);
  console.log('');
  console.log('변경하려면:  node set_code.js 새코드');
  process.exit(0);
}
if (newCode.length < 4) {
  console.error('오류: 인증코드는 4자 이상이어야 합니다.');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
const old = cfg.accessCode;
cfg.accessCode = newCode;
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');

console.log('인증코드 변경:', old, '->', newCode);
console.log('');
console.log('이제 아래 명령으로 배포하세요 (전 직원에게 적용됩니다):');
console.log('');
console.log('  node build_v2.js && git add -A && git commit -m "인증코드 변경" && git push');
console.log('');
