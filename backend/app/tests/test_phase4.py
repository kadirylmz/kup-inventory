from datetime import date, timedelta


def test_projects_licenses_and_maintenance(client, admin_headers):
    # 1. Adana Müzesi projesini oluştur
    proj_res = client.post(
        "/api/v1/projects",
        headers=admin_headers,
        json={
            "code": "PRJ-ADANA-01",
            "name": "Adana Müzesi",
            "customer": "Kültür ve Turizm Bakanlığı",
            "start_date": str(date.today()),
            "manager_name": "Kadir Bey",
            "address": "Adana Merkez",
            "status": "active",
            "description": "Müze projeksiyon ve medya sunucusu kurulumu",
        },
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]

    # 2. Projeye seri numaralı projektör gönder
    assets = client.get("/api/v1/assets", headers=admin_headers).json()
    prj_asset = assets[0]

    send_res = client.post(
        f"/api/v1/projects/{proj_id}/send",
        headers=admin_headers,
        json={
            "items": [{"product_id": prj_asset["product_id"], "asset_id": prj_asset["id"], "quantity": "1"}],
            "note": "Salon 1 projeksiyonu",
        },
    )
    assert send_res.status_code == 200
    s_data = send_res.json()
    assert s_data["still_in_project_items"] == 1
    assert s_data["purchase_cost_by_currency"]["EUR"] == 9500.0
    assert s_data["market_value_by_currency"]["EUR"] == 7200.0

    # 3. Projeden ekipman geri dönüşü (iade)
    pa_id = s_data["equipment"][0]["id"]
    ret_res = client.post(
        f"/api/v1/projects/{proj_id}/return",
        headers=admin_headers,
        json={"project_asset_id": pa_id, "returned_quantity": "1", "note": "Sergi sonu dönüş"},
    )
    assert ret_res.status_code == 200
    assert ret_res.json()["still_in_project_items"] == 0
    assert ret_res.json()["returned_items"] == 1

    # 4. Şifreli Yazılım Lisansı oluştur (10 gün sonra bitecek -> 15_days uyarısı vermeli)
    exp_date = date.today() + timedelta(days=10)
    lic_res = client.post(
        "/api/v1/licenses",
        headers=admin_headers,
        json={
            "software_name": "Resolume Arena",
            "vendor": "Resolume BV",
            "version": "7.21",
            "license_type": "per_device",
            "license_key": "RES7-AAAA-BBBB-CCCC-9876",
            "license_no": "LIC-2026-001",
            "end_date": str(exp_date),
            "seats_total": 2,
            "seats_used": 1,
            "cost": "1199.00",
            "currency": "EUR",
        },
    )
    assert lic_res.status_code == 201
    lic = lic_res.json()
    # Normal çıktıda açık anahtar bulunmamalı, yalnızca maskeli olmalı
    assert "license_key" not in lic
    assert lic["key_masked"].startswith("RES****")
    assert lic["expiry_alert_level"] == "15_days"

    # Yetkili kullanıcı açık anahtarı çözebilmeli (audit log yazılır)
    key_res = client.get(f"/api/v1/licenses/{lic['id']}/key", headers=admin_headers)
    assert key_res.status_code == 200
    assert key_res.json()["license_key"] == "RES7-AAAA-BBBB-CCCC-9876"

    # Viewer rolü açık lisans anahtarını görememeli (403)
    v_login = client.post("/api/v1/auth/login", json={"email": "v@kup.local", "password": "Viewer12345!"})
    if v_login.status_code == 200:
        vh = {"Authorization": f"Bearer {v_login.json()['access_token']}"}
        assert client.get(f"/api/v1/licenses/{lic['id']}/key", headers=vh).status_code == 403

    # Lisans yenileme
    new_exp = date.today() + timedelta(days=365)
    ren_res = client.post(
        f"/api/v1/licenses/{lic['id']}/renew",
        headers=admin_headers,
        json={"new_end_date": str(new_exp), "cost": "599.00", "currency": "EUR"},
    )
    assert ren_res.status_code == 200
    assert ren_res.json()["expiry_alert_level"] == "ok"

    # 5. Teknik Servis ve Periyodik Bakım Kaydı + Toplam Cihaz Bakım Maliyeti
    srv_res = client.post(
        "/api/v1/service-records",
        headers=admin_headers,
        json={
            "product_id": prj_asset["product_id"],
            "asset_id": prj_asset["id"],
            "fault_type": "Optik Blok / Fan Arızası",
            "fault_description": "Lazer soğutma fanı ses yapıyor",
            "service_company": "Yetkili Panasonic Servisi",
            "sent_date": str(date.today()),
            "labor_cost": "2500.00",
            "parts_cost": "4000.00",
            "currency": "TRY",
            "warranty_covered": False,
            "result": "in_service",
        },
    )
    assert srv_res.status_code == 201
    assert float(srv_res.json()["total_cost"]) == 6500.0

    # Periyodik bakım ekle
    mnt_res = client.post(
        "/api/v1/maintenance-records",
        headers=admin_headers,
        json={
            "product_id": prj_asset["product_id"],
            "asset_id": prj_asset["id"],
            "maintenance_type": "Filtre ve Termal Bakım",
            "description": "Toz filtreleri temizlendi",
            "performed_date": str(date.today()),
            "next_maintenance_date": str(date.today() + timedelta(days=90)),
            "cost": "1000.00",
            "currency": "TRY",
            "technician_name": "Mehmet Usta",
        },
    )
    assert mnt_res.status_code == 201

    # Cihazın toplam bakım maliyeti 6500 + 1000 = 7500 TRY olmalı
    cost_res = client.get(f"/api/v1/assets/{prj_asset['id']}/maintenance-cost", headers=admin_headers)
    assert cost_res.status_code == 200
    assert cost_res.json()["total_cost_by_currency"]["TRY"] == 7500.0
