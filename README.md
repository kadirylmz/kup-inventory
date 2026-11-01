# KÜP INVENTORY — Enterprise Asset & Inventory Management System

**KÜP Prodüksiyon** için geliştirilmiş; şirketin tüm fiziksel varlıklarını, seri numaralı teknik ekipmanlarını, adet/metre bazlı sarf malzemelerini, yazılım lisanslarını, personel zimmetlerini, müze/sergi projelerini, depolarını, teknik servis/bakım geçmişlerini ve 3 boyutlu finansal değerlerini (**Alış Maliyeti**, **Güncel İkinci El Piyasa Değeri**, **Muhasebesel Net Defter Değeri**) tek merkezden yöneten kurumsal web platformudur.

---

## Temel Özellikler

- **İki Farklı Takip Modeli**:
  1. **Adet / Metre Bazlı Ürünler**: Örneğin 100 metre CAT6 kablo, 50 adet HDMI kablo.
  2. **Seri Numarası Bazlı Cihazlar**: Örneğin 10 adet Panasonic PT-RZ690B projektör (ortak model altında her cihazın seri numarası, QR kodu, durumu ve lokasyonu ayrı takip edilir).
- **Üç Boyutlu Finansal Değerleme & Kur Yönetimi (`TRY`, `EUR`, `USD`)**:
  - Alış maliyeti değiştirilemez; düzeltmeler denetim izli düzeltme fişi ile yapılır.
  - Güncel ikinci el piyasa değeri manuel veya onaylı referans araştırması ile güncellenir (kaynak yoksa asla uydurma değer üretmez).
  - Muhasebesel net defter değeri (amortisman) otomatik hesaplanır.
- **Depo, Raf ve Onaylı Transfer Yönetimi**:
  - Merkez Depo, Teknik Atölye, Ofis, Proje Deposu, Servis Alanı ve alt raf/bölüm kırılımları.
  - Depolar arası transferler onaylanmadan lokasyon ve bakiye değişmez.
- **Geriye Dönük Silinemez Stok Hareketleri**:
  - 14 hareket türü; hatalı kayıtlar silinmez, ters işlem (reversal) ile düzeltilir.
- **Proje Ekipman Yönetimi, Personel Zimmetleri, Şifreli Yazılım Lisansları & Teknik Servis/Bakım**:
  - Yazılım lisans anahtarları veritabanında **Fernet/AES** ile şifreli saklanır, arayüzde maskelenir ve yalnızca yetkili kullanıcılar tarafından denetim kaydıyla görüntülenir.
- **QR Kod Sistemi & Depo Sayım Modülü**:
  - Her cihaza özel QR etiket üretimi, basılabilir etiket sayfası ve barkod/QR okuyucu ile fiziksel sayım (Bulunan, Eksik, Fazla, Yanlış Lokasyon, Seri No Uyuşmazlığı).
- **18 Kurumsal Rapor Motoru (Web Önizleme & PDF)**:
  - Excel/CSV dışa aktarma içermez; tüm raporlar web önizleme ve kurumsal PDF/yazdırma düzeninde üretilir.
- **Offline LAN Çalışma, RBAC Yetkilendirme & SHA-256 Doğrulamalı Yedekleme**:
  - İnternet bağlantısı olmadan yerel ağda (`http://inventory.local` veya yerel IP) çalışır.

---

## Teknoloji Yığını

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts, TanStack Query, React Router
- **Backend**: Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, Argon2id, PyJWT, Cryptography (Fernet), QRCode
- **Veritabanı & Altyapı**: PostgreSQL 16, Docker, Docker Compose, Nginx Reverse Proxy

---

## Hızlı Başlangıç

### Seçenek 1: Docker Compose ile Kurumsal Kurulum (Önerilen)
```bash
cp .env.example .env
docker compose up -d --build
```
veya Windows üzerinde doğrudan **`baslat-docker.bat`** dosyasına çift tıklayın.
- **Web Arayüzü**: `http://localhost` (veya `http://inventory.local`)

### Seçenek 2: Yerel Geliştirme Ortamında Başlatma
Windows üzerinde **`baslat-yerel.bat`** dosyasına çift tıklayın veya:
```bash
# Backend
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Varsayılan Yönetici Girişi
- **E-posta**: `admin@kup.local`
- **Şifre**: `ChangeMe!12345`

---

## Testlerin Çalıştırılması

```bash
cd backend
pytest -v
```
