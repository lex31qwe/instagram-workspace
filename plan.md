# Instagram Workspace — GitHub Pages + Supabase planı

## Ürün kapsamı
Tek kullanıcılı, yalnızca Instagram odaklı mobil PWA paneli. Frontend GitHub Pages üzerinde statik olarak çalışır; Supabase Auth/Database ve Edge Function güvenli işlemleri yürütür; video dosyaları Cloudinary unsigned upload ile HTTPS URL alır; Instagram Graph API yayın işlemi Edge Function içinden yapılır. X, ekip, rol ve davet kapsam dışıdır.

## Tasarım
- **Hareket:** Mobile-first editorial operations dashboard; yoğun bilgi yerine net durum sinyalleri.
- **İlkeler:** Hızlı taranabilirlik, tek elle kullanım, yüksek kontrast, her işlemde görünür durum.
- **Renk felsefesi:** Koyu lacivert zemin güven ve odak; mercan vurgu yayın eylemini; yeşil başarıyı, amber beklemeyi, kırmızı hatayı belirtir.
- **Düzen:** Mobilde alt sekme çubuğu; masaüstünde sol navigasyon ve geniş içerik alanı. Büyük kartlar, yatay kaydırılabilir kuyruk ve sabit birincil eylem.
- **İmza öğeleri:** Durum noktaları, medya küçük resim kartları, gradient başlık rozeti.
- **Etkileşim:** Her işlem hemen toast/log üretir; başarısız adımlar yeniden denenebilir; ağ beklerken düğmeler kilitlenir.
- **Animasyon:** 180–240 ms yumuşak geçiş, yalnızca anlamlı durumlarda pulse; gereksiz hareket yok.
- **Tipografi:** Sistem sans-serif; başlıklarda güçlü ağırlık, yardımcı metinde 13–14 px.
- **Marka:** “Instagram Workspace — videodan yayına tek akış.” Kişilik: net, hızlı, kontrollü.
- **Ses tonu:** “Bugün sırada ne var?” ve “Yayın hazır; son durumu buradan izle.”
- **Wordmark:** Instagram kamera çerçevesi içinde iki dikey akış çizgisi.
- **İmza rengi:** `#ff6b5f` mercan.

## Proje yapısı
- `index.html`: Mobil SPA kabuğu, giriş ekranı ve ana görünümler.
- `styles.css`: Responsive tema, kartlar, form, toast ve mobil navigasyon.
- `app.js`: Supabase client, auth, Cloudinary yükleme, kuyruk, hesap ve geçmiş akışları.
- `config.example.js`: Frontend’e konabilecek public Supabase/Cloudinary değerleri; secret içermez.
- `supabase/schema.sql`: Auth kullanıcısına bağlı tablolar ve RLS politikaları.
- `supabase/functions/instagram/index.ts`: Tokenı Edge Function secret olarak okuyup Graph API yayınlama ve hesap listesi.
- `manifest.webmanifest`, `sw.js`: GitHub Pages PWA kurulumu.
- `manus-routes.json`: Webdev route bildirimi.
- `README.md`: GitHub Pages, Supabase, Cloudinary ve Meta kurulum adımları.

## Güvenlik sınırları
Access Token, Cloudinary API secret ve Supabase service-role key frontend’e veya GitHub’a konmaz. Cloudinary unsigned upload preset public kabul edilir; yalnızca gerekli video upload endpoint’i için kullanılır. Instagram tokenları `INSTAGRAM_ACCOUNTS_JSON` Edge Function secret’ında tutulur.

## Bilinçli MVP sınırı
GitHub Pages + Supabase Edge Functions, `yt-dlp` gibi uzun süreli Instagram kaynak-video indirme işçisi değildir. İlk sürüm telefondan MP4 yükleme ve doğrudan HTTPS video URL’siyle yayınlamayı güvenilir biçimde destekler. Instagram kaynak linkleri kuyrukta kaydedilir; bunların otomatik indirilmesi sonraki ayrı worker/deployment adımıdır.
