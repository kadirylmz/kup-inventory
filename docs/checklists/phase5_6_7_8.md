# PHASE 5, 6, 7 & 8 — Tamamlanma ve Doğrulama Kontrol Listesi

## PHASE 5: Ürün Değerleme, Finansal Takip ve Döviz Yönetimi
- [x] Ürünün 3 farklı değeri birbirinden ayrıldı ve anlık kur çevirimiyle karşılaştırıldı (`/api/v1/finance/three-values` & `Valuations.tsx`):
  1. **Alış Maliyeti** (Değiştirilemez kayıt; düzeltmeler denetim izli `/api/v1/purchase-records/correction` ile yapılır)
  2. **Güncel İkinci El Piyasa Değeri** (Manuel giriş + onay akışı `/api/v1/valuations/{id}/approve`)
  3. **Muhasebesel Net Defter Değeri** (Amortisman düşülmüş net değer)
- [x] Otomatik değerleme araştırması (`/api/v1/valuations/research`) güvenilir kaynak bulunmadığında **kesinlikle uydurma değer üretmez**, kullanıcı onayı olmadan piyasa değerini değiştirmez.
- [x] `TRY`, `EUR`, `USD` kur tablosu ve internet olmadan manuel kur girişi (`/api/v1/exchange-rates`).

## PHASE 6: Depo Sayım Modülü ve 18 Profesyonel PDF Rapor Motoru
- [x] Depo bazlı sayım başlatma (`/api/v1/stocktakes`), QR/Barkod/Seri numarası okutma (`/scan`) ve sayım onayı (`/approve`).
- [x] Sayım sonucunda **Bulunan**, **Eksik**, **Fazla**, **Yanlış Lokasyonda Bulunan** ve **Seri Numarası Uyuşmazlığı** tespiti.
- [x] Excel/CSV dışa aktarma bulunmaksızın **18 kurumsal raporun tamamı** için gerçek veritabanı önizleme ve kurumsal PDF/yazdırma şablonu (`/api/v1/reports/{report_id}` & `Reports.tsx`).
- [x] Seri numaralı cihazlar için basılabilir QR etiket sayfası (`Reports.tsx`).

## PHASE 7: Bildirim Merkezi, Yedekleme ve Sistem Ayarları
- [x] Yaklaşan yazılım lisans yenilemeleri, garanti bitişleri, kritik stok ve servisteki cihazlar için otomatik bildirim üretimi (`/api/v1/notifications` & `Notifications.tsx`).
- [x] Veritabanı anlık görüntüsü + yüklenen görsel/belgeleri kapsayan tek tıkla ZIP yedekleme (`/api/v1/backups/run`) ve **SHA-256 bütünlük doğrulama** (`/api/v1/backups/{id}/verify`).
- [x] Şirket ünvanı, varsayılan para birimi, LAN adresi ve otomatik yedekleme saati ayarları (`/api/v1/settings` & `SettingsBackups.tsx`).

## PHASE 8: Ticari Uygulama Lisanslama ve Dağıtım Hazırlığı
- [x] Kurumsal ürün lisanslama, dijital imza doğrulama, kullanıcı/varlık kotası ve sunucu aktivasyon kaydı (`/api/v1/app-license` & `SystemLicense.tsx`).
- [x] Yerel geliştirme/çalıştırma betikleri (`baslat-yerel.bat` ve `baslat-docker.bat`) ve eksiksiz `README.md`.
- [x] Backend `pytest` test paketi: **11/11 PASSED**.
- [x] Frontend `tsc -b && vite build`: **0 hata ile başarılı**.
