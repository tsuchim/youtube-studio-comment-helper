// 簡易バリデーション：MV3 & 必須キー & ホスト権限
const fs = require('fs');

const raw = fs.readFileSync('manifest.json', 'utf-8');
const m = JSON.parse(raw);

function fail(msg) {
  console.error('[manifest] ' + msg);
  process.exit(1);
}
if (m.manifest_version !== 3) fail('manifest_version must be 3');
if (!Array.isArray(m.content_scripts) || m.content_scripts.length === 0)
  fail('content_scripts is required');
if (!Array.isArray(m.host_permissions) || !m.host_permissions.includes('https://studio.youtube.com/*'))
  fail('host_permissions must include studio.youtube.com');
console.log('[manifest] OK');

// アイコン存在チェック
['assets/icon-16.png','assets/icon-48.png','assets/icon-128.png'].forEach((p) => {
  if (!fs.existsSync(p) || fs.statSync(p).size === 0) fail(`icon missing or empty: ${p}`);
});
