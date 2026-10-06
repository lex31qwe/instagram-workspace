# Instagram link worker (Windows)

Bu worker, panelden eklenen `link_queue` kayıtlarını bilgisayarda indirir, Cloudinary’ye HTTPS video olarak yükler ve ilgili `media_assets` kaydını günceller. Panel telefondan kullanılabilir; ancak indirme worker’ı çalışırken Windows bilgisayar açık kalmalıdır.

## Kurulum

PowerShell:

```powershell
cd "C:\Users\lex\Desktop\InstagramWorkspace"
py -m pip install yt-dlp requests
```

`worker\worker_config.example.json` dosyasını `worker\worker_config.json` olarak kopyalayın. Supabase service-role anahtarını bu yerel dosyaya yazın; GitHub’a veya sohbete göndermeyin.

## Çalıştırma

```powershell
py worker\instagram_link_worker.py
```

Worker her 20 saniyede bir yeni link arar. `Ctrl+C` ile kapatılır.

> Instagram erişim kısıtlamaları, yaş/ülke kısıtları veya giriş gerektiren içerikler indirilemeyebilir. Yalnızca indirme ve yeniden paylaşma hakkınız olan içerikleri kullanın.
