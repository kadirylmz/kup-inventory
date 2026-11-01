def test_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    assert client.get("/api/v1/ready").status_code == 200


def test_unauthenticated(client):
    assert client.get("/api/v1/users").status_code == 401


def test_bad_login(client):
    r = client.post("/api/v1/auth/login", json={"email": "x@kup.local", "password": "nope"})
    assert r.status_code == 401


def test_me_and_refresh(client, admin_headers):
    me = client.get("/api/v1/auth/me", headers=admin_headers).json()
    assert "user.manage" in me["permissions"]
    r = client.post("/api/v1/auth/refresh")
    assert r.status_code == 200 and r.json()["access_token"]


def test_user_crud_and_rbac(client, admin_headers):
    roles = client.get("/api/v1/roles", headers=admin_headers).json()
    viewer = next(r for r in roles if r["code"] == "VIEWER")
    assert client.post("/api/v1/users", headers=admin_headers, json={
        "email": "v@kup.local", "full_name": "Test Viewer", "password": "short", "role_ids": []}).status_code == 422
    r = client.post("/api/v1/users", headers=admin_headers, json={
        "email": "v@kup.local", "full_name": "Test Viewer", "password": "Viewer12345!", "role_ids": [viewer["id"]]})
    assert r.status_code == 201
    login = client.post("/api/v1/auth/login", json={"email": "v@kup.local", "password": "Viewer12345!"})
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=h).status_code == 200
    assert client.get("/api/v1/users", headers=h).status_code == 403  # viewer kullanıcı listeleyemez
    assert client.get("/api/v1/audit", headers=h).status_code == 403
    audit = client.get("/api/v1/audit", headers=admin_headers).json()
    assert any(a["action"] == "user.create" for a in audit)


def test_lockout(client):
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"email": "v@kup.local", "password": "wrong"})
    r = client.post("/api/v1/auth/login", json={"email": "v@kup.local", "password": "Viewer12345!"})
    assert r.status_code == 429
