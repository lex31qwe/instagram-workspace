import json
import os
import subprocess
import sys
import tempfile
import time
import argparse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = Path(os.environ.get("INSTA_WORKER_CONFIG", ROOT / "worker_config.json"))


def load_config():
    if not CONFIG_PATH.exists():
        raise SystemExit(f"Ayar dosyası bulunamadı: {CONFIG_PATH}")
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    required = ("supabase_url", "supabase_service_role_key", "cloudinary_cloud_name", "cloudinary_upload_preset")
    missing = [key for key in required if not data.get(key) or "BURAYA" in str(data.get(key))]
    if missing:
        raise SystemExit("Eksik worker ayarı: " + ", ".join(missing))
    return data


def headers(config):
    key = config["supabase_service_role_key"]
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def supabase_get(config, table, params):
    response = requests.get(f"{config['supabase_url'].rstrip('/')}/rest/v1/{table}", headers=headers(config), params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def supabase_patch(config, table, params, payload):
    response = requests.patch(f"{config['supabase_url'].rstrip('/')}/rest/v1/{table}", headers={**headers(config), "Prefer": "return=minimal"}, params=params, json=payload, timeout=30)
    response.raise_for_status()


def claim_link(config):
    # Tek worker kullanıldığı için yarım kalan processing kaydı yeniden denenebilir.
    rows = supabase_get(config, "link_queue", {"order": "created_at.asc", "limit": "100", "select": "id,owner_id,url,status"})
    counts = {}
    for row in rows:
        counts[row.get("status", "unknown")] = counts.get(row.get("status", "unknown"), 0) + 1
    if counts:
        print(f"[DURUM] Link kuyruğu: {counts}", flush=True)
    links = [row for row in rows if row.get("status") in ("queued", "processing")]
    if not links:
        return None
    link = links[0]
    supabase_patch(config, "link_queue", {"id": f"eq.{link['id']}", "status": "in.(queued,processing)"}, {"status": "processing", "error_message": None})
    return link


def download(url, folder):
    output = str(Path(folder) / "video.%(ext)s")
    command = [sys.executable, "-m", "yt_dlp", "--no-playlist", "--socket-timeout", "30", "--retries", "2", "--fragment-retries", "2", "--merge-output-format", "mp4", "-o", output, url]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError("İndirme 5 dakika içinde tamamlanmadı; link erişimi veya Instagram rate-limit kontrol edilmeli.") from error
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or "yt-dlp bilinmeyen hata verdi.").strip().splitlines()[-1]
        raise RuntimeError(f"yt-dlp: {detail[:700]}") from error
    files = list(Path(folder).glob("video.*"))
    if not files:
        raise RuntimeError("yt-dlp video dosyası üretmedi.")
    return files[0]


def upload_cloudinary(config, path):
    endpoint = f"https://api.cloudinary.com/v1_1/{config['cloudinary_cloud_name']}/video/upload"
    with path.open("rb") as video:
        response = requests.post(endpoint, files={"file": (path.name, video, "video/mp4")}, data={"upload_preset": config["cloudinary_upload_preset"]}, timeout=300)
    response.raise_for_status()
    result = response.json()
    if not result.get("secure_url"):
        raise RuntimeError("Cloudinary secure_url döndürmedi.")
    return result


def find_media(config, owner_id, url):
    rows = supabase_get(config, "media_assets", {"owner_id": f"eq.{owner_id}", "source_url": f"eq.{url}", "select": "id", "limit": "1"})
    return rows[0]["id"] if rows else None


def process(config, link):
    with tempfile.TemporaryDirectory(prefix="insta-worker-") as folder:
        video = download(link["url"], folder)
        cloud = upload_cloudinary(config, video)
    media_id = find_media(config, link["owner_id"], link["url"])
    if not media_id:
        raise RuntimeError("Bekleyen medya kaydı bulunamadı; link tekrar eklenmeli.")
    supabase_patch(config, "media_assets", {"id": f"eq.{media_id}", "owner_id": f"eq.{link['owner_id']}"}, {"public_url": cloud["secure_url"], "cloudinary_public_id": cloud.get("public_id"), "status": "ready", "size_bytes": cloud.get("bytes")})
    supabase_patch(config, "link_queue", {"id": f"eq.{link['id']}"}, {"status": "completed", "error_message": None})
    print(f"[OK] Cloudinary hazır: {link['url']}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Bir link işle ve çık; GitHub Actions modu")
    args = parser.parse_args()
    config = load_config()
    delay = int(config.get("poll_seconds", 20))
    print("Instagram link worker çalışıyor. Çıkış: Ctrl+C")
    while True:
        link = None
        try:
            link = claim_link(config)
            if link:
                print(f"[İNDİRİLİYOR] {link['url']}")
                process(config, link)
                if args.once:
                    return
            else:
                print(f"[BEKLENİYOR] Yeni link aranıyor... ({delay} sn)", flush=True)
                if args.once:
                    return
                time.sleep(delay)
        except KeyboardInterrupt:
            print("Worker kapatıldı.")
            return
        except Exception as error:
            print(f"[HATA] {error}")
            if link:
                try:
                    supabase_patch(config, "link_queue", {"id": f"eq.{link['id']}"}, {"status": "failed", "error_message": str(error)[:1000]})
                except Exception as patch_error:
                    print(f"[HATA] Durum güncellenemedi: {patch_error}")
            if args.once:
                return
            time.sleep(delay)


if __name__ == "__main__":
    main()
