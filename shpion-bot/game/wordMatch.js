// Impostor so'zni taxmin qilganda: katta/kichik harf, apostrof (o', g') borligi/yo'qligi
// va "x"/"h" harflari adashtirilishi hisobga olinmaydi. Taxminan 60% o'xshashlik yetarli.

function normalize(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[ʻʼ’‘`´]/g, "'") // turli apostrof belgilarini bittasiga keltirish
    .replace(/'/g, '') // apostrofni butunlay olib tashlash (belgi qoldirilsa ham mos kelsin)
    .replace(/h/g, 'x') // yumshoq "h" va qattiq "x" ni bir xil deb hisoblash
    .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // o'chirish
        dp[i][j - 1] + 1, // qo'shish
        dp[i - 1][j - 1] + cost // almashtirish
      );
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

function isCloseMatch(guess, target, threshold = 0.6) {
  return similarity(guess, target) >= threshold;
}

module.exports = { normalize, levenshtein, similarity, isCloseMatch };
