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
- **Backend**: Python 3.11+ / 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, Argon2id, PyJWT, Cryptography (Fernet), QRCode
- **Veritabanı & Altyapı**: PostgreSQL (16, 17 veya 18), Docker, Docker Compose, Nginx Reverse Proxy

---

## Sistem Gereksinimleri (Hangi Programlar Gerekli?)

Sunucuyu çalıştırmak için ortamınıza en uygun yöntemi seçebilirsiniz:

### Yöntem 1: Yerel Çalıştırma (Doğrudan Windows Üzerinde)
- **Gerekli Programlar**:
  - **Node.js (LTS)**: [nodejs.org](https://nodejs.org/) (npm ile birlikte).
  - **Python 3.11+ / 3.12+**: [python.org](https://www.python.org/) üzerinden yükleyin (*"Add python.exe to PATH"* işaretli olmalı).
  - **PostgreSQL (16 - 18)**: [postgresql.org](https://www.postgresql.org/download/windows/) üzerinden yükleyin.

### Yöntem 2: Docker ile Kurulum (Konteyner Mimarisi)
- **Gerekli Programlar**:
  - [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows için WSL2 tabanlı kurulum).
  - *Not: Docker kullanıldığında bilgisayara ayrıca Python veya PostgreSQL kurmaya gerek kalmaz.*

---

## Yerel Kurulum & Çalıştırma Adımları (PostgreSQL ile)

Bu projeyi yerel ortamda çalıştırmak için uygulanan tam akış:

### 1. PostgreSQL Kurulumu & Yapılandırması
1. PostgreSQL kurulum sihirbazında süper kullanıcı (`postgres`) parolası belirlenir:
   - **Varsayılan Kullanıcı**: `postgres`
   - **Şifre**: `123456`
   - **Port**: `5432`
2. Türkçe Windows sistemlerde `initdb` karakter seti uyarısı vermemesi için veritabanı kümesi `C` locale ve `UTF-8` ile başlatılır:
   ```powershell
   "C:\Program Files\PostgreSQL\18\bin\initdb.exe" -D "C:\Program Files\PostgreSQL\18\data" -U postgres -E UTF8 --locale=C -A scram-sha-256
   ```
3. PostgreSQL servisi başlatılır:
   ```powershell
   "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\18\data" -l "C:\Program Files\PostgreSQL\18\data\logfile" start
   ```
4. Projenin ana veritabanı oluşturulur:
   ```powershell
   "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -h 127.0.0.1 -U postgres kup_inventory
   ```

---

### 2. Çevre Değişkenleri (`.env`)
Proje kök dizinindeki `.env` ve `backend/.env` dosyalarında şu ayarlar tanımlanmıştır:
```env
POSTGRES_DB=kup_inventory
POSTGRES_USER=postgres
POSTGRES_PASSWORD=123456
DATABASE_URL=postgresql+psycopg://postgres:123456@localhost:5432/kup_inventory
SECRET_KEY=kup-prod-secret-key-9f8e7d6c5b4a3210-secure-256bit
COOKIE_SECURE=false
FIRST_ADMIN_EMAIL=admin@kup.local
FIRST_ADMIN_PASSWORD=ChangeMe!12345
```

---

### 3. Backend & Frontend Kurulumu (İlk Seferlik)
```bash
# 1. Backend sanal ortamı ve kütüphaneleri:
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 2. Frontend kütüphaneleri:
cd ../frontend
npm install
```

---

### 4. Tek Tıkla Kurulum ve Başlatma (`otomatik-kur-ve-baslat.bat`) 🚀
İster ilk defa kuruyor olun, ister daha sonra sunucuyu açmak isteyin; tek yapmanız gereken **`otomatik-kur-ve-baslat.bat`** dosyasına çift tıklamaktır.

Bu betik sırasıyla:
1. `.env` ayar dosyalarını kontrol eder, eksikse otomatik üretir.
2. PostgreSQL veritabanı kümesini ve `kup_inventory` veritabanını kontrol eder, kapalıysa başlatır.
3. Python sanal ortamını (`.venv`) ve eksik kütüphaneleri otomatik yükler.
4. Frontend `npm install` paketlerini kontrol eder, eksikse kurar.
5. Backend (`:8000`) ve Frontend (`:5173`) sunucularını aynı anda ayağa kaldırır.

*(Not: Daha önce kurulum yaptıysanız ve yalnızca hızlıca sunucuları açmak isterseniz **`baslat-yerel.bat`** dosyasını da kullanabilirsiniz.)*

---

## Sisteme Giriş Bilgileri

Web arayüzü açıldığında giriş için kullanılacak varsayılan hesap:
- **Giriş URL**: [http://localhost:5173](http://localhost:5173) (Yerel çalıştırma) veya [http://localhost](http://localhost) (Docker)
- **API Dokümantasyonu (Swagger)**: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- **Yönetici E-posta**: `admin@kup.local`
- **Yönetici Parola**: `ChangeMe!12345`

---

## Alternatif: Docker ile Başlatma

Docker Desktop arka planda açıkken proje dizinindeki **`baslat-docker.bat`** dosyasına çift tıklayın veya:
```bash
docker compose up -d --build
```
Sistem `http://localhost` üzerinden yayına girer.

---

## Sık Karşılaşılan Sorunlar ve Çözümleri

### 1. `Sistem belirtilen dosyayı bulamıyor` (Terminal Hatası)
- **Neden**: Komut satırı proje klasöründe değil, `C:\Windows\System32` dizininde açılmıştır.
- **Çözüm**: Komut satırında önce proje dizinine gidin:
  ```cmd
  cd C:\Users\kadir\Desktop\kup-inventory
  ```
  Veya `baslat-yerel.bat` dosyasına doğrudan çift tıklayın.

### 2. `failed to connect to the docker API` Hatası
- **Neden**: Docker Desktop uygulaması arka planda çalışmıyor.
- **Çözüm**: Başlat menüsünden **Docker Desktop**'ı açın. Sol altta baloncuk yeşile dönüp "Engine running" yazdıktan sonra `baslat-docker.bat`'ı çalıştırın.

### 3. `Port 80 is already in use` (Port Çakışması - Docker)
- **Neden**: Bilgisayarınızda IIS veya başka bir servis 80 portunu kullanıyor olabilir.
- **Çözüm**: `docker-compose.yml` dosyasındaki `ports` kısmını `"8080:80"` olarak değiştirip `http://localhost:8080` adresinden sisteme erişebilirsiniz.

### 4. Yerel Ağdaki Diğer Cihazlardan (Tablet, Telefon, Başka PC) Bağlanma
- Ana makinenin yerel IP adresini öğrenin (`ipconfig` komutu ile, örn: `192.168.1.45`).
- Diğer cihazların tarayıcısına `http://192.168.1.45:5173` (veya Docker için `http://192.168.1.45`) yazarak sisteme erişebilirsiniz.

---

## Testlerin Çalıştırılması

```bash
cd backend
pytest -v
```
