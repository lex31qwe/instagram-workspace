# Instagram Workspace

Telefondan kullanılabilen, tek kullanıcılı Instagram yayın paneli. Bu ilk sürüm **GitHub Pages + Supabase + Cloudinary + Instagram Graph API** ile çalışır. X entegrasyonu yoktur.

## Dosya yapısı

```text
instaworkspace/
├── index.html                         # Mobil SPA arayüzü
├── styles.css                         # Koyu/açık tema ve responsive tasarım
├── app.js                             # Supabase, Cloudinary, kuyruk ve yayın akışı
├── config.example.js                  # Public frontend ayar şablonu
├── manifest.webmanifest               # PWA manifesti
├── sw.js                              # Basit servis çalışanı
├── icon.svg                           # PWA ikonu
├── manus-routes.json                  # Webdev route bildirimi
├── app.config.ts                      # Proje logo metadata'sı
├── supabase/schema.sql                # Tablolar + RLS
├── supabase/functions/instagram/      # Güvenli Edge Function
│   └── index.ts
└── .github/workflows/pages.yml        # GitHub Pages deploy
```

## Önemli güvenlik kuralı

`Access Token`, `Cloudinary API Secret` ve `Supabase service-role key` frontend’e veya GitHub’a konmaz. Frontend’de yalnızca Supabase **anon key**, Cloudinary cloud name ve unsigned upload preset bulunur. Instagram hesap tokenları `INSTAGRAM_ACCOUNTS_JSON` adlı Edge Function secret’ında tutulur.

## 1. Supabase projesi

1. [supabase.com](https://supabase.com) üzerinde proje açın.
2. **Authentication → Users → Add user** ile kendi e-posta/şifrenizi oluşturun. Email confirmation açıksa kendi e-postanızı doğrulayın.
3. **SQL Editor** bölümünü açın.
4. `supabase/schema.sql` içeriğinin tamamını çalıştırın.
5. **Project Settings → API** bölümünden `Project URL` ve `anon public` değerlerini alın. Bunlar frontend için kullanılabilir public değerlerdir.

### Edge Function kurulumu

Supabase CLI kuruluysa proje klasöründe:

```bash
supabase login
supabase link --project-ref PROJE_REFINIZ
supabase functions deploy instagram
```

Ardından tokenları dashboard’dan veya CLI ile secret olarak tanımlayın. Aşağıdaki JSON sadece biçim örneğidir; gerçek tokenı GitHub’a, README’ye veya sohbet mesajına yazmayın:

```json
[
  {
    "key": "ana-hesap",
    "label": "Ana Instagram",
    "instagram_user_id": "1784...",
    "access_token": "META_ACCESS_TOKEN_BURADA"
  }
]
```

CLI kullanırken:

```bash
supabase secrets set INSTAGRAM_GRAPH_VERSION=v21.0
supabase secrets set INSTAGRAM_ACCOUNTS_JSON='[{"key":"ana-hesap","label":"Ana Instagram","instagram_user_id":"1784...","access_token":"TOKENI_BURAYA_YAZ"}]'
```

Windows PowerShell’de JSON tırnakları sorun çıkarırsa Supabase Dashboard → **Edge Functions → Secrets** ekranından iki secret oluşturun:

```text
INSTAGRAM_GRAPH_VERSION = v21.0
INSTAGRAM_ACCOUNTS_JSON = [gerçek JSON dizisi]
```

`INSTAGRAM_ACCOUNTS_JSON` içindeki `key` değeri uygulamada hedef hesap seçimi için kullanılan etikettir. Birden fazla hesap için aynı diziye birden fazla nesne ekleyebilirsiniz.

## 2. Cloudinary

1. [cloudinary.com](https://cloudinary.com) hesabı açın.
2. Dashboard’dan **Cloud Name** değerini alın.
3. **Settings → Upload → Upload presets → Add upload preset** seçin.
4. Signing mode değerini **Unsigned** yapın.
5. Preset adını kaydedin.
6. Cloud name ve preset adını GitHub Actions değişkenleri olarak ekleyin.

Bu uygulama Cloudinary’nin unsigned video upload endpoint’ini kullanır. API secret frontend’e gerekmez ve koyulmamalıdır.

## 3. GitHub repository

1. GitHub’da boş bir repository oluşturun.
2. Bu klasördeki dosyaları repository köküne gönderin:

```bash
git init
git add .
git commit -m "Instagram Workspace ilk sürüm"
git branch -M main
git remote add origin https://github.com/KULLANICI/REPO.git
git push -u origin main
```

3. Repository → **Settings → Pages** bölümünde Source olarak **GitHub Actions** seçin.
4. Repository → **Settings → Secrets and variables → Actions → Variables** bölümünde şu **repository variables** değerlerini ekleyin:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
CLOUDINARY_CLOUD_NAME
CLOUDINARY_UPLOAD_PRESET
```

Supabase anon key ve unsigned preset public frontend yapılandırmasının parçasıdır. Buna rağmen service-role key, Cloudinary API secret veya Instagram Access Token kesinlikle eklenmez.

5. `main` branch’e push yaptığınızda `.github/workflows/pages.yml` siteyi otomatik yayınlar.
6. GitHub Actions tamamlanınca **Settings → Pages** içindeki URL’yi telefonda açın.

## 4. Yerelde önizleme

`config.js` üretmeden de demo görünümü açılır. Gerçek Supabase bağlantısı için:

```bash
cp config.example.js config.js
```

Sonra `config.js` içindeki public değerleri doldurun ve statik sunucuyu çalıştırın:

```bash
python3 -m http.server 3000 --bind 0.0.0.0
```

Windows PowerShell:

```powershell
python -m http.server 3000
```

Tarayıcıda `http://localhost:3000` açın.

## 5. Telefon kullanım akışı

Siteyi açın, Supabase kullanıcınızla giriş yapın. **Medya** sayfasından MP4 seçtiğinizde video Cloudinary’ye yüklenir ve HTTPS URL’si veritabanına kaydedilir. Medya kartındaki **Kuyruğa al** düğmesiyle yayın kuyruğuna geçin. Burada açıklama/hashtag yazın, hedef hesabı seçin ve **Seçileni yayınla** düğmesine basın.

Edge Function Instagram’da önce Reel container oluşturur, işlenme durumunu bekler ve `media_publish` çağrısıyla yayınlar. Sonuç ve hata mesajları geçmiş/log ekranına yazılır.

## 6. Link akışı hakkında gerçek sınır

Instagram linklerini veritabanında kuyruk notu olarak saklayan ekran hazırdır. GitHub Pages ve Supabase Edge Functions uzun süreli `yt-dlp` indirme worker’ı değildir. İlk güvenilir akış telefondan MP4 yüklemedir. Linkten otomatik indirme için ayrıca izinli bir worker/sunucu gerekir; rate-limit ve içerik erişimi sebebiyle bunu Instagram API yayınından ayrı tutmak gerekir.

## 7. Güncelleme

Kod değiştikçe:

```bash
git add .
git commit -m "Güncelleme açıklaması"
git push origin main
```

GitHub Actions yeni sürümü otomatik yayınlar. Supabase tabloları ve Edge Function secret’ları GitHub deploy’undan bağımsız korunur.

## 8. Sık hatalar

- **Supabase bağlantısı yok:** `SUPABASE_URL` veya `SUPABASE_ANON_KEY` yanlış/eksik.
- **Cloudinary yüklemesi başarısız:** Cloud name veya unsigned preset yanlış; preset video upload kabul etmeli.
- **Hedef hesap bulunamadı:** `INSTAGRAM_ACCOUNTS_JSON` içinde uygulamadaki `key` ile eşleşen nesne yok.
- **Instagram token hatası:** Token süresi, Business ID, hesap türü veya Meta izinlerini kontrol edin.
- **Video işleme uzun sürüyor:** Instagram container durumunu daha sonra yeniden deneyin; video HTTPS üzerinden erişilebilir olmalı.
