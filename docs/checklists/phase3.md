# PHASE 3 – Tamamlanma Kontrol Listesi

| Madde | Durum | Not |
|---|---|---|
| Depolar (`warehouses`) ve 5 standart kurumsal depo | ✅ | Merkez Depo, Teknik Atölye, Ofis, Proje Deposu, Servis Alanı |
| Raf, Bölüm ve Alan (`warehouse_locations`) yönetimi | ✅ | Hiyerarşik `shelf / section / area` desteği |
| Depo Bazlı Stok Bakiyeleri (`stock_balances`) | ✅ | `CHECK (quantity >= 0)` ile negatif stok koruması |
| 14 Stok Hareket Türü + Ters İşlem (`reverses_id`) | ✅ | Hareketler silinmez; ters işlem (`reversal`) ile düzeltilir |
| Onaylı Depolar Arası Transfer (`transfers`) | ✅ | Onaylanmadan (`pending`) ürün/cihaz lokasyonu ve bakiye değişmez |
| Departman ve Personel Yönetimi (`departments`, `employees`) | ✅ | Personelin üzerindeki tüm aktif zimmetleri tek ekranda görme |
| Zimmet Teslim, İade ve Yazdırılabilir Tutanak (`assignments`) | ✅ | Otomatik `assign`/`unassign` hareketi ve yazdırılabilir teslim/iade belgesi |
| Alembic Migration (`0003_phase3_warehouse_assignment.py`) | ✅ | 9/9 pytest ve frontend build doğrulandı |
