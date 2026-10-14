const test = require('node:test');
const assert = require('node:assert/strict');
const { translations, text, localizeMessage, quotaLabel, countdown, age } = require('../app/renderer/i18n.js');
test('Thai covers all UI keys, durations, quota labels and errors; unsupported locales fall back safely', () => {
  for (const key of Object.keys(translations.en)) assert.equal(typeof translations.th[key], 'string', key);
  assert.equal(text('th', 'language'), 'ภาษา');
  assert.equal(text('invalid', 'language'), 'Language');
  assert.equal(quotaLabel({ id: 'five_hour', windowMinutes: 300 }, 'th'), 'ขีดจำกัด 5 ชั่วโมง');
  assert.equal(quotaLabel({ id: 'weekly', windowMinutes: 10080 }, 'th'), 'ขีดจำกัด 7 วัน');
  assert.equal(countdown(3660, 'th'), '1 ชม. 1 นาที');
  assert.equal(countdown(86400, 'th'), '1 วัน 0 ชม.');
  assert.equal(age(1000, 'th', 31000), '30 วินาทีที่แล้ว');
  assert.equal(localizeMessage('th', 'Settings could not be saved.'), 'บันทึกการตั้งค่าไม่สำเร็จ');
  assert.equal(localizeMessage('en', 'Settings could not be saved.'), 'Settings could not be saved.');
  assert.equal(localizeMessage('th', 'future-provider-message'), 'future-provider-message');
});
test('Burmese covers all UI keys and shows durations and ages in Burmese', () => {
  for (const key of Object.keys(translations.en)) assert.equal(typeof translations.my[key], 'string', key);
  assert.equal(text('my', 'settings'), 'ဆက်တင်များ');
  assert.equal(countdown(3660, 'my'), '၁ နာရီ ၁ မိနစ်');
  assert.equal(countdown(86400 * 5 + 14 * 3600, 'my'), '၅ ရက် ၁၄ နာရီ');
  assert.equal(countdown(120, 'my'), '၂ မိနစ်');
  assert.equal(age(1000, 'my', 52000), '၅၁ စက္ကန့်အကြာက');
  assert.equal(age(1000, 'my', 1000 + 7300000), '၂ နာရီအကြာက');
  assert.equal(countdown(3660, 'en'), '1h 1m');
});
