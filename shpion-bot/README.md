# Shpionni top — Telegram bot

Guruhda o'ynaladigan so'z-impostor o'yini. Bir kishi (impostor) yashirin so'zni bilmaydi,
qolganlar so'zga tegishli sifatlarni aytib, impostorni chalg'itmasdan fosh qilishga harakat qiladi.

## O'rnatish

```bash
npm install
cp .env.example .env
```

`.env` faylini to'ldiring:
- `BOT_TOKEN` — [@BotFather](https://t.me/BotFather) dan olingan token
- `MONGODB_URI` — MongoDB Atlas ulanish satri (so'zlar va ballar shu yerda saqlanadi)
- `ADMIN_IDS` — ixtiyoriy, so'z qo'sha oladigan foydalanuvchi ID'lari (vergul bilan)
- `HINT_UNLOCK_SCORE` — shuncha ball to'plagan o'yinchi impostor bo'lganda so'zning bosh harfini ko'radi (standart: 5)
- `GUESS_THRESHOLD` — `/taxmin` uchun kerakli o'xshashlik darajasi, 0-1 oralig'ida (standart: 0.6 = 60%)

Botni ishga tushirish:

```bash
npm start
```

## Railway'ga deploy qilish

1. Repozitoriyani GitHub'ga yuklang.
2. Railway'da "New Project" → "Deploy from GitHub repo".
3. Railway loyihasida `.env`dagi barcha o'zgaruvchilarni kiriting.
4. Start command avtomatik `npm start` bo'ladi.

Bot long-polling rejimida ishlaydi, shuning uchun doimiy ishlab turuvchi muhit (Railway, Render) kerak.

## O'yin qoidalari va gameplay

1. **Lobi** — guruhda `/yangioyin`, kamida 3 kishi "✅ Qo'shilish" tugmasini bosadi.
2. **Boshlash** — host "▶️ O'yinni boshlash"ni bosadi:
   - MongoDB so'zlar ombiridan tasodifiy so'z tanlanadi.
   - Bitta o'yinchi tasodifiy IMPOSTOR bo'ladi.
   - Har kimga **shaxsiy xabarda** so'z (yoki impostor holati) yuboriladi — buning uchun har bir
     o'yinchi botga oldindan shaxsiy `/start` bosgan bo'lishi shart.
   - Agar impostor bo'lib chiqqan o'yinchi shu guruhda kamida `HINT_UNLOCK_SCORE` ball to'plagan
     bo'lsa, unga qo'shimcha maslahat sifatida so'zning **bosh harfi** ko'rsatiladi.
3. **Sifat aytish** — guruhda navbat bilan (bot tartibni kuzatib boradi) har kim so'zga tegishli
   bitta sifat yozadi. **3 marta to'liq aylanadan so'ng ovoz berish avtomatik boshlanadi** — buni
   host qo'lda ishga tushirmaydi.
4. **Ovoz berish** — tugmalar orqali kim impostorligini tanlaydilar:
   - Agar **to'g'ri impostor** topilsa → o'yin tugaydi, qolgan barcha o'yinchilarga **+1 ball**.
   - Agar **noto'g'ri odam** chiqarilsa → o'sha o'yinchi o'yindan chetlashtiriladi va **o'yin davom
     etadi** — yana 3 aylana sifat aytiladi, so'ng yana avtomatik ovoz.
   - Agar shu tariqa **3 marta noto'g'ri odam chiqarilsa** (yoki impostordan boshqa hech kim
     qolmasa) → IMPOSTOR G'ALABA qozonadi, unga **+3 ball**.
5. **Impostorning taxmini** — impostor istalgan payt botga **shaxsiy chatda** `/taxmin <so'z>`
   yuborib, yashirin so'zni topishga urinishi mumkin:
   - Katta/kichik harf farqi muhim emas.
   - Apostrof (`o'`, `g'`) borligi yoki yo'qligi muhim emas.
   - "x" va "h" harflari bir xil deb hisoblanadi.
   - Taxminan 60% (yoki `GUESS_THRESHOLD` da belgilangan) o'xshashlik yetarli — kichik imlo
     xatolari (bitta harf yetishmasa yoki noto'g'ri bo'lsa) ham qabul qilinadi.
   - To'g'ri topsa, IMPOSTOR darhol g'alaba qozonadi va **+3 ball** oladi.
   - **Har bir aylanada faqat 2 marta urinish** mumkin (adolatli bo'lishi uchun — istalgan vaqt
     cheksiz urinish yo'q). Urinishlar soni har yangi aylana boshlanganda qayta tiklanadi.

## Ballar va reyting

- `/reyting` — guruh bo'yicha eng ko'p ball to'plaganlar ro'yxati.
- Ballar har bir guruh (chat) uchun alohida hisoblanadi.

## So'zlar omborini boshqarish

Botga **shaxsiy chatda**:
- `/sozqosh <so'z>` — yangi so'z qo'shish (masalan: `/sozqosh Muzqaymoq`)
- `/sozlar` — hozircha nechta so'z borligini ko'rish

Har safar o'yin boshlanganda so'z ushbu ombordan **tasodifiy** tanlanadi.

## Boshqa buyruqlar

- `/bekor` — (host) faol o'yinni bekor qilish
- `/yordam` — barcha buyruqlar va qoidalar ro'yxati
