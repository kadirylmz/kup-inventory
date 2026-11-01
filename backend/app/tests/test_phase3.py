def test_warehouses_transfers_movements_and_assignments(client, admin_headers):
    # 1. Varsayılan 5 depo gelmeli
    whs = client.get("/api/v1/warehouses", headers=admin_headers).json()
    assert len(whs) >= 5
    central = next(w for w in whs if w["code"] == "WH-CENTRAL")
    workshop = next(w for w in whs if w["code"] == "WH-WORKSHOP")

    # 2. Merkez depoya raf ekle
    loc_res = client.post(
        f"/api/v1/warehouses/{central['id']}/locations",
        headers=admin_headers,
        json={"code": "RAF-A1", "name": "Raf A-1", "kind": "shelf"},
    )
    assert loc_res.status_code == 201
    loc_id = loc_res.json()["id"]

    # 3. Adet bazlı HDMI kablo ürünü oluştur
    cats = client.get("/api/v1/categories", headers=admin_headers).json()
    hdmi_cat = next(c for c in cats if c["code"] == "HDMI")
    prod = client.post(
        "/api/v1/products",
        headers=admin_headers,
        json={
            "name": "HDMI 2.1 Fiber 10m Kablo",
            "category_id": hdmi_cat["id"],
            "tracking_type": "quantity",
            "unit": "Adet",
            "quantity": "0",
        },
    ).json()

    # 4. İlk ürün girişi hareketi (Merkez Depo / Raf A-1'e 50 adet)
    m_in = client.post(
        "/api/v1/movements",
        headers=admin_headers,
        json={
            "movement_type": "initial",
            "product_id": prod["id"],
            "quantity": "50",
            "to_warehouse_id": central["id"],
            "to_location_id": loc_id,
            "note": "İlk sayım girişi",
        },
    )
    assert m_in.status_code == 201

    # 5. Stok negatif değere düşmemeli (60 adet çıkış denemesi 422 dönmeli)
    neg = client.post(
        "/api/v1/movements",
        headers=admin_headers,
        json={
            "movement_type": "out",
            "product_id": prod["id"],
            "quantity": "60",
            "from_warehouse_id": central["id"],
            "from_location_id": loc_id,
        },
    )
    assert neg.status_code == 422

    # 6. Depolar arası transfer talebi (Onaylanmadan bakiye değişmemeli!)
    trf = client.post(
        "/api/v1/transfers",
        headers=admin_headers,
        json={
            "from_warehouse_id": central["id"],
            "from_location_id": loc_id,
            "to_warehouse_id": workshop["id"],
            "product_id": prod["id"],
            "quantity": "15",
            "note": "Atölye testleri için",
        },
    )
    assert trf.status_code == 201
    trf_id = trf.json()["id"]

    # Onay öncesi Merkez Depo bakiyesi hâlâ 50 olmalı
    stock_before = client.get(
        f"/api/v1/warehouses/stock?warehouse_id={central['id']}", headers=admin_headers
    ).json()
    hdmi_stock = next(s for s in stock_before if s["product_id"] == prod["id"])
    assert float(hdmi_stock["quantity"]) == 50.0

    # Transferi onayla -> Merkez Depo 35, Teknik Atölye 15 olmalı
    app_res = client.post(f"/api/v1/transfers/{trf_id}/approve", headers=admin_headers)
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "approved"

    stock_central = client.get(
        f"/api/v1/warehouses/stock?warehouse_id={central['id']}", headers=admin_headers
    ).json()
    stock_workshop = client.get(
        f"/api/v1/warehouses/stock?warehouse_id={workshop['id']}", headers=admin_headers
    ).json()
    hdmi_central = next(s for s in stock_central if s["product_id"] == prod["id"])
    assert float(hdmi_central["quantity"]) == 35.0
    assert float(stock_workshop[0]["quantity"]) == 15.0

    # 7. Yanlış işlem için Ters İşlem (Reversal) testi
    bad_out = client.post(
        "/api/v1/movements",
        headers=admin_headers,
        json={
            "movement_type": "out",
            "product_id": prod["id"],
            "quantity": "5",
            "from_warehouse_id": workshop["id"],
            "note": "Hatalı çıkış",
        },
    ).json()
    rev_res = client.post(
        f"/api/v1/movements/{bad_out['id']}/reverse",
        headers=admin_headers,
        json={"reason": "Yanlışlıkla düşüldü, iptal"},
    )
    assert rev_res.status_code == 201
    stock_workshop_after = client.get(
        f"/api/v1/warehouses/stock?warehouse_id={workshop['id']}", headers=admin_headers
    ).json()
    assert float(stock_workshop_after[0]["quantity"]) == 15.0

    # 8. Departman, Personel ve Zimmet Teslim / İade testi
    dept = client.post(
        "/api/v1/departments", headers=admin_headers, json={"name": "Teknik Prodüksiyon"}
    ).json()
    emp = client.post(
        "/api/v1/employees",
        headers=admin_headers,
        json={
            "full_name": "Ahmet Yılmaz",
            "department_id": dept["id"],
            "position": "Görüntü Yönetmeni",
            "email": "ahmet@kup.local",
        },
    ).json()

    # Seri numaralı cihazlardan birini bul ve zimmetle
    assets = client.get("/api/v1/assets", headers=admin_headers).json()
    target_asset = assets[0]

    asg = client.post(
        "/api/v1/assignments",
        headers=admin_headers,
        json={
            "employee_id": emp["id"],
            "from_warehouse_id": central["id"],
            "note": "Saha çekimi zimmeti",
            "items": [{"product_id": target_asset["product_id"], "asset_id": target_asset["id"], "quantity": "1"}],
        },
    )
    assert asg.status_code == 201
    asg_data = asg.json()
    assert asg_data["status"] == "active"

    # Personelin üzerindeki ürünler listesinde görünmeli
    emp_assets = client.get(f"/api/v1/employees/{emp['id']}/assets", headers=admin_headers).json()
    assert len(emp_assets) == 1
    assert emp_assets[0]["serial_number"] == target_asset["serial_number"]

    # Zimmet iadesi yap
    ret = client.post(
        f"/api/v1/assignments/{asg_data['id']}/return",
        headers=admin_headers,
        json={
            "assignment_item_id": asg_data["items"][0]["id"],
            "returned_quantity": "1",
            "to_warehouse_id": central["id"],
            "condition_on_return": "excellent",
            "note": "Eksiksiz teslim alındı",
        },
    )
    assert ret.status_code == 200
    assert ret.json()["status"] == "returned"
    assert len(client.get(f"/api/v1/employees/{emp['id']}/assets", headers=admin_headers).json()) == 0
