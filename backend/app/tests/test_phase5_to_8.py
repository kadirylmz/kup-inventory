from datetime import date


def test_phase5_to_8_complete(client, admin_headers):
    # 1. PHASE 5: Döviz Kurları & 3 Farklı Finansal Değer (Alış, Piyasa, Net Defter)
    rate_res = client.post(
        "/api/v1/exchange-rates",
        headers=admin_headers,
        json={
            "rate_date": str(date.today()),
            "currency_code": "EUR",
            "rate_to_try": "40.00",
            "source": "manual",
            "note": "Güncel serbest piyasa kuru",
        },
    )
    assert rate_res.status_code == 201
    assert rate_res.json()["rate_to_try"] == 40.0

    three_res = client.get("/api/v1/finance/three-values?reporting_currency=TRY", headers=admin_headers)
    assert three_res.status_code == 200
    three_data = three_res.json()
    assert three_data["reporting_currency"] == "TRY"
    assert three_data["exchange_rates_to_try"]["EUR"] == 40.0
    assert len(three_data["items"]) >= 1

    prod_id = three_data["items"][0]["product_id"]

    # 2. Otomatik değerleme araştırması:
    # a) Piyasa değeri tanımlı olmayan yepyeni bir ürün için uydurma değer üretmemeli (found_reliable_source = False)
    cats = client.get("/api/v1/categories", headers=admin_headers).json()
    unvalued_prod = client.post(
        "/api/v1/products",
        headers=admin_headers,
        json={
            "name": "Değerlemesiz Test Cihazı",
            "category_id": cats[0]["id"],
            "brand_name": "ÖzelMarka",
            "model_name": "ÖzelModel-X1",
            "tracking_type": "quantity",
            "unit": "Adet",
            "quantity": "2",
        },
    ).json()
    res_empty = client.get(f"/api/v1/valuations/research?product_id={unvalued_prod['id']}", headers=admin_headers)
    assert res_empty.status_code == 200
    assert res_empty.json()["found_reliable_source"] is False
    assert res_empty.json()["suggested_value"] is None

    # b) Ürün kartında güncel piyasa değeri tanımlıysa bunu referans olarak çekebilmeli
    res_card_ref = client.get(f"/api/v1/valuations/research?product_id={prod_id}", headers=admin_headers)
    assert res_card_ref.status_code == 200
    assert res_card_ref.json()["found_reliable_source"] is True

    # 3. Önerilen (proposed) değerleme oluştur ve kullanıcı onayıyla uygula
    val_prop = client.post(
        "/api/v1/valuations",
        headers=admin_headers,
        json={
            "product_id": prod_id,
            "condition": "excellent",
            "market_value": "6800.00",
            "currency": "EUR",
            "valuation_source": "Avrupa İkinci El AV Ekipman Borsası",
            "auto_approve": False,
        },
    )
    assert val_prop.status_code == 201
    val_id = val_prop.json()["id"]
    assert val_prop.json()["status"] == "proposed"

    app_val = client.post(f"/api/v1/valuations/{val_id}/approve", headers=admin_headers)
    assert app_val.status_code == 200
    assert app_val.json()["status"] == "approved"

    # Şimdi araştırma yapıldığında onaylı geçmiş referansı bulmalı
    res_found = client.get(f"/api/v1/valuations/research?product_id={prod_id}", headers=admin_headers)
    assert res_found.status_code == 200
    assert res_found.json()["found_reliable_source"] is True
    assert res_found.json()["suggested_value"] == 6800.0

    # 4. Alış maliyeti düzeltme kaydı (Denetim iziyle)
    corr_res = client.post(
        "/api/v1/purchase-records/correction",
        headers=admin_headers,
        json={
            "product_id": prod_id,
            "purchase_date": str(date.today()),
            "unit_price": "9600.00",
            "currency": "EUR",
            "vat_rate": "20.00",
            "invoice_no": "FAT-DUZ-001",
            "reason": "Gümrük navlun farkı faturası eklendi",
        },
    )
    assert corr_res.status_code == 201
    assert corr_res.json()["new_unit_price"] == 9600.0

    # 5. PHASE 6: Depo Sayım Modülü (Stocktake)
    warehouses = client.get("/api/v1/warehouses", headers=admin_headers).json()
    wh_merkez = next(w for w in warehouses if w["code"] == "WH-CENTRAL")
    wh_atolye = next(w for w in warehouses if w["code"] == "WH-WORKSHOP")

    assets = client.get("/api/v1/assets", headers=admin_headers).json()
    first_asset = assets[0]

    # Teknik Atölyede sayım başlat
    st_res = client.post(
        "/api/v1/stocktakes",
        headers=admin_headers,
        json={"warehouse_id": wh_atolye["id"], "note": "Yıl sonu teknik atölye sayımı"},
    )
    assert st_res.status_code == 201
    st_id = st_res.json()["id"]

    # Merkez depoda görünen cihazı Teknik Atölyede okut -> wrong_location (Yanlış Lokasyon) çıkmalı
    scan1 = client.post(
        f"/api/v1/stocktakes/{st_id}/scan",
        headers=admin_headers,
        json={"serial_or_qr": first_asset["serial_number"]},
    )
    assert scan1.status_code == 200
    assert scan1.json()["summary"]["wrong_location"] >= 1

    # Sistemde hiç olmayan bir seri numarası okut -> serial_mismatch çıkmalı
    scan2 = client.post(
        f"/api/v1/stocktakes/{st_id}/scan",
        headers=admin_headers,
        json={"serial_or_qr": "UNKNOWN-SN-99999"},
    )
    assert scan2.status_code == 200
    assert scan2.json()["summary"]["serial_mismatch"] == 1

    # Sayım notunu düzenle ve yanlış okutulan satırı sil
    st_upd = client.patch(
        f"/api/v1/stocktakes/{st_id}",
        headers=admin_headers,
        json={"note": "Güncellenmiş yıl sonu sayım notu"},
    )
    assert st_upd.status_code == 200
    assert st_upd.json()["note"] == "Güncellenmiş yıl sonu sayım notu"

    mismatch_item = next(i for i in st_upd.json()["items"] if i["result"] == "serial_mismatch")
    del_item = client.delete(
        f"/api/v1/stocktakes/{st_id}/items/{mismatch_item['id']}",
        headers=admin_headers,
    )
    assert del_item.status_code == 200
    assert del_item.json()["summary"]["serial_mismatch"] == 0

    # Sayımı onayla -> yanlış lokasyondaki cihazın deposu güncellenmeli
    st_app = client.post(f"/api/v1/stocktakes/{st_id}/approve", headers=admin_headers)
    assert st_app.status_code == 200
    assert st_app.json()["status"] == "approved"

    # 6. PHASE 6: 18 Rapor Motoru
    rep_types = client.get("/api/v1/reports/types", headers=admin_headers)
    assert rep_types.status_code == 200
    assert len(rep_types.json()) == 18

    for r_meta in rep_types.json():
        r_res = client.get(f"/api/v1/reports/{r_meta['id']}?currency=TRY", headers=admin_headers)
        assert r_res.status_code == 200
        assert r_res.json()["report_id"] == r_meta["id"]

    # 7. PHASE 7: Bildirimler, Yedekleme & Sistem Ayarları
    notifs = client.get("/api/v1/notifications", headers=admin_headers)
    assert notifs.status_code == 200
    assert isinstance(notifs.json(), list)

    bkp_res = client.post("/api/v1/backups/run", headers=admin_headers)
    assert bkp_res.status_code == 201
    bkp_id = bkp_res.json()["id"]

    ver_res = client.post(f"/api/v1/backups/{bkp_id}/verify", headers=admin_headers)
    assert ver_res.status_code == 200
    assert ver_res.json()["integrity_ok"] is True

    set_res = client.put(
        "/api/v1/settings",
        headers=admin_headers,
        json={
            "company_name": "KÜP Prodüksiyon A.Ş.",
            "default_reporting_currency": "TRY",
            "auto_backup_enabled": True,
            "auto_backup_time": "03:00",
            "lan_domain": "http://inventory.local",
        },
    )
    assert set_res.status_code == 200
    assert set_res.json()["company_name"] == "KÜP Prodüksiyon A.Ş."

    # 8. PHASE 8: Ticari Uygulama Lisanslama
    lic_status = client.get("/api/v1/app-license", headers=admin_headers)
    assert lic_status.status_code == 200
    assert lic_status.json()["is_licensed"] is True

    act_res = client.post(
        "/api/v1/app-license/activate",
        headers=admin_headers,
        json={
            "customer_name": "KÜP Prodüksiyon",
            "edition": "Enterprise",
            "license_key": "KUP-ENT-2026-PROD-9999",
            "max_users": 250,
            "max_assets": 100000,
        },
    )
    assert act_res.status_code == 200
    assert act_res.json()["ok"] is True
