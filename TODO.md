# Instagram Workspace ilk sürüm takip listesi

- Mobil panel, tek kullanıcı girişini desteklemeli; dashboard kuyruktaki, işlenen, yayınlanan ve hatalı içerik sayılarını göstermeli.
- Telefonda MP4 seçildiğinde Cloudinary unsigned upload ile HTTPS medya URL’si alınmalı ve medya kaydı Supabase `media_assets` tablosuna yazılmalı.
- Instagram reel/post linkleri `link_queue` tablosunda UTF-8 metin olarak saklanmalı; linkten otomatik indirme worker’ı ayrı bir dağıtım adımı olarak ele alınmalı.
- Kullanıcı medya kartından bir içeriği yayın kuyruğuna alabilmeli; açıklama, hashtag, hedef hesap ve yayın durumu düzenlenebilmeli.
- Supabase Edge Function tokenı frontend’e açmadan Instagram Graph API container oluşturmalı, işlenme durumunu beklemeli ve `media_publish` çağrısını yapmalı.
- Başarılı ve hatalı sonuçlar `publish_logs` tablosuna zaman damgası, hedef hesap, medya ve anlaşılır hata mesajıyla yazılmalı; hatalı kuyruk öğesi yeniden denenebilmeli.
- Açık/koyu tema, PWA manifesti, servis çalışanı ve ana ekrana ekleme akışı mobil tarayıcıda çalışmalı.
- GitHub Pages workflow public config değerlerini GitHub Actions variables üzerinden üretmeli; secret tokenlar repository’ye yazılmamalı.
