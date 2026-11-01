import io


def test_default_categories_seeded(client, admin_headers):
    r = client.get("/api/v1/categories", headers=admin_headers)
    assert r.status_code == 200
    cats = r.json()
    assert len(cats) >= 22
    codes = {c["code"] for c in cats}
    assert {"PRJ", "LED", "MSRV", "HDMI", "CAT6"}.issubset(codes)


def test_brand_model_product_and_serialized_assets(client, admin_headers, tmp_path, monkeypatch):
    from app.core.config import get_settings

    get_settings().upload_dir = str(tmp_path)

    # 1. Marka oluştur
    b_res = client.post(
        "/api/v1/brands",
        headers=admin_headers,
        json={"name": "Panasonic", "country": "Japan", "website": "https://panasonic.com"},
    )
    assert b_res.status_code == 201
    brand_id = b_res.json()["id"]

    # 2. Model oluştur
    m_res = client.post(
        "/api/v1/models",
        headers=admin_headers,
        json={
            "brand_id": brand_id,
            "name": "PT-RZ690B",
            "specs": {"Lümen": "6500 ANSI", "Çözünürlük": "WUXGA (1920x1200)", "Lazer": "DLP"},
        },
    )
    assert m_res.status_code == 201
    model_id = m_res.json()["id"]

    # 3. Kategori bul (Projeksiyon Cihazları - PRJ)
    cats = client.get("/api/v1/categories", headers=admin_headers).json()
    prj_cat = next(c for c in cats if c["code"] == "PRJ")

    # 4. Seri numaralı ürün ve 2 adet başlangıç cihazı oluştur
    p_res = client.post(
        "/api/v1/products",
        headers=admin_headers,
        json={
            "name": "Panasonic PT-RZ690B Lazer Projektör",
            "category_id": prj_cat["id"],
            "brand_id": brand_id,
            "model_id": model_id,
            "tracking_type": "serial",
            "unit": "Adet",
            "purchase_price": "9500.00",
            "purchase_currency": "EUR",
            "current_market_value": "7200.00",
            "market_value_currency": "EUR",
            "warehouse_name": "Merkez Depo",
            "shelf_section": "Raf A-1",
            "attributes": [{"key": "Lens", "value": "ET-DLE170"}],
            "initial_serial_numbers": ["SN-PRJ-001", "SN-PRJ-002"],
        },
    )
    assert p_res.status_code == 201
    prod = p_res.json()
    assert prod["serial_asset_count"] == 2
    assert prod["inventory_code"].startswith("KUP-PRJ-")

    # 5. Toplu seri numaralı varlık ekle (+2 cihaz daha)
    bulk_res = client.post(
        "/api/v1/assets/bulk",
        headers=admin_headers,
        json={
            "product_id": prod["id"],
            "serial_numbers": ["SN-PRJ-003", "SN-PRJ-004"],
            "warehouse_name": "Merkez Depo",
            "shelf_section": "Raf A-2",
        },
    )
    assert bulk_res.status_code == 201
    assert len(bulk_res.json()) == 2

    # 6. Mükerrer seri numarası reddedilmeli
    dup_res = client.post(
        "/api/v1/assets",
        headers=admin_headers,
        json={"product_id": prod["id"], "serial_number": "SN-PRJ-001"},
    )
    assert dup_res.status_code == 409

    # 7. QR token ile genel sorgulama (hassas finansal bilgi dönmemeli)
    first_asset = bulk_res.json()[0]
    qr_res = client.get(f"/api/v1/q/{first_asset['qr_token']}")
    assert qr_res.status_code == 200
    qr_data = qr_res.json()
    assert qr_data["serial_number"] == "SN-PRJ-003"
    assert "purchase_price" not in qr_data

    # 8. Ürün fotoğrafı yükleme (geçerli PNG magic byte ile)
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    img_res = client.post(
        f"/api/v1/products/{prod['id']}/images",
        headers=admin_headers,
        files={"file": ("projector.png", io.BytesIO(png_bytes), "image/png")},
        data={"caption": "Ön görünüm", "is_primary": "true"},
    )
    assert img_res.status_code == 201
    img_url = img_res.json()["url"]
    assert client.get(img_url).status_code == 200

    # 9. Sahte uzantılı dosya reddedilmeli (magic-byte koruması)
    bad_res = client.post(
        f"/api/v1/products/{prod['id']}/images",
        headers=admin_headers,
        files={"file": ("hack.png", io.BytesIO(b"not-a-png-file"), "image/png")},
    )
    assert bad_res.status_code == 422

    # 10. Adet bazlı ürün oluşturma (ör. 100m CAT6 kablo)
    cat6_cat = next(c for c in cats if c["code"] == "CAT6")
    q_res = client.post(
        "/api/v1/products",
        headers=admin_headers,
        json={
            "name": "CAT6 S/FTP Harici Network Kablosu",
            "category_id": cat6_cat["id"],
            "tracking_type": "quantity",
            "unit": "Metre",
            "quantity": "100",
            "min_stock": "20",
            "purchase_price": "35.00",
            "purchase_currency": "TRY",
            "warehouse_name": "Merkez Depo",
        },
    )
    assert q_res.status_code == 201

    # 11. Özet istatistik kontrolü
    sum_res = client.get("/api/v1/inventory/summary", headers=admin_headers)
    assert sum_res.status_code == 200
    summary = sum_res.json()
    assert summary["total_product_cards"] == 2
    assert summary["total_serial_assets"] == 4
    assert summary["total_physical_units"] == 104.0
