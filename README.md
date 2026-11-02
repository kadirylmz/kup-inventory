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

## Sistem Gereksinimleri (Hangi Programlar Gerekli?)

Sunucuyu çalıştırmak için ortamınıza en uygun yöntemi seçebilirsiniz:

### Yöntem 1: Docker ile Kurulum (Önerilen — En Kolay Yol)
Tüm servisler (Python API, React arayüzü, PostgreSQL 16 veritabanı ve Nginx reverse proxy) izole konteynerlar içinde hazır çalışır. **Bilgisayarınıza ayrıca Python veya PostgreSQL kurmanıza gerek kalmaz.**

- **Gerekli Programlar**:
  - [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows için WSL2 tabanlı kurulum önerilir).
  - *Not: Docker Desktop kurulduktan sonra arka planda açık ve çalışır ("Engine running") durumda olmalıdır.*

### Yöntem 2: Yerel Geliştirici Ortamı (Docker Olmadan)
Eğer sistemi doğrudan Windows üzerinde geliştirmek veya çalıştırmak isterseniz:

- **Gerekli Programlar**:
  - **Python 3.11 veya 3.12**: [python.org](https://www.python.org/downloads/) üzerinden indirin. Kurulum sihirbazının ilk ekranındaki **"Add python.exe to PATH"** kutucuğunu mutlaka işaretleyin.
  - **Node.js (LTS)**: [nodejs.org](https://nodejs.org/) (npm ile birlikte gelir, v20 veya üzeri).
  - **PostgreSQL 16**: [postgresql.org](https://www.postgresql.org/download/windows/) üzerinden indirin ve `kup_inventory` adında bir veritabanı oluşturun.
  - **Git**: [git-scm.com](https://git-scm.com/) (Kaynak kod yönetimi için).

---

## Hızlı Başlangıç (İlk Kez Çalıştırma)

### Seçenek 1: Docker Compose ile Kurumsal Kurulum (Önerilen)

1. **Docker Desktop'ı Başlatın:**
   - Windows Başlat menüsünden **Docker Desktop** uygulamasını açın.
   - Sol alttaki göstergenin yeşil (**"Engine running"**) olmasını bekleyin.

2. **Çevre Değişkenlerini Hazırlayın (`.env`):**
   ```bash
   # Windows Komut İstemi (CMD):
   copy .env.example .env

   # PowerShell:
   Copy-Item .env.example .env
   ```

3. **Sunucuyu Ayağa Kaldırın:**
   - Windows üzerinde doğrudan **`baslat-docker.bat`** dosyasına çift tıklayabilirsiniz (bu betik `.env` yoksa otomatik oluşturur ve Docker konteynerlarını ayağa kaldırır).
   - Veya komut satırından:
     ```bash
     docker compose up -d --build
     ```

4. **Sisteme Giriş:**
   - **Web Arayüzü**: `http://localhost` (veya yerel ağ IP adresiniz: `http://192.168.x.x`)
   - **Varsayılan Yönetici Bilgileri**:
     - **E-posta**: `admin@kup.local`
     - **Şifre**: `ChangeMe!12345`

---

### Seçenek 2: Yerel Geliştirme Ortamında Başlatma (Docker'sız)

Windows üzerinde **`baslat-yerel.bat`** dosyasına çift tıklayın veya elle başlatın:

```bash
# 1. Backend Kurulumu ve Başlatma
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. Frontend Kurulumu ve Başlatma (Yeni bir terminalde)
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```
- **Yerel Geliştirme Arayüzü**: `http://localhost:5173`
- **Backend API Docs (Swagger)**: `http://localhost:8000/docs`

---

## Sık Karşılaşılan Sorunlar ve Çözümleri

### 1. `failed to connect to the docker API` Hatası
- **Neden**: Docker Desktop uygulaması arka planda çalışmıyor.
- **Çözüm**: Başlat menüsünden **Docker Desktop**'ı açın. Sol altta baloncuk yeşile dönüp "Engine running" yazdıktan sonra `baslat-docker.bat`'ı tekrar çalıştırın.

### 2. `Port 80 is already in use` (Port Çakışması)
- **Neden**: Bilgisayarınızda IIS, Skype veya başka bir yerel servis 80 numaralı portu kullanıyor olabilir.
- **Çözüm**: `docker-compose.yml` dosyasındaki `ports` satırını `"8080:80"` olarak değiştirip `http://localhost:8080` adresinden sisteme erişebilirsiniz.

### 3. Yerel Ağdaki Diğer Cihazlardan (Tablet, Telefon, Başka PC) Bağlanma
- Sunucunun çalıştığı ana makinenin yerel IP adresini öğrenin (`ipconfig` komutu ile, örn: `192.168.1.45`).
- Ağdaki diğer cihazların tarayıcısına `http://192.168.1.45` yazarak sisteme erişebilirsiniz. Windows Güvenlik Duvarı bağlantı uyarısı verirse "Özel Ağlar" için onay verin.

---

## Testlerin Çalıştırılması

```bash
cd backend
pytest -v
```
