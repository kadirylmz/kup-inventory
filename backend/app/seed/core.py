import hashlib
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.permissions import MODULES, SYSTEM_ROLES
from app.core.security import hash_password
from app.models.core import Permission, Role, User
from app.models.finance_count_system import AppLicense, Currency, ExchangeRate
from app.models.inventory import Category
from app.models.warehouse_assignment import Warehouse

DEFAULT_CATEGORIES: list[tuple[str, str, str]] = [
    ("PRJ", "Projeksiyon Cihazları", "serial"),
    ("LED", "LED Ekranlar", "serial"),
    ("VWALL", "Video Wall Sistemleri", "serial"),
    ("MSRV", "Medya Sunucuları", "serial"),
    ("PC", "Bilgisayarlar", "serial"),
    ("MON", "Monitörler", "serial"),
    ("RPI", "Raspberry Pi", "serial"),
    ("ARD", "Arduino ve Kontrol Kartları", "quantity"),
    ("AUD", "Ses Sistemleri", "serial"),
    ("CAM", "Kameralar", "serial"),
    ("SNS", "Sensörler", "quantity"),
    ("CBL", "Kablolar", "quantity"),
    ("HDMI", "HDMI Ekipmanları", "quantity"),
    ("CAT6", "CAT6 Ekipmanları", "quantity"),
    ("NET", "Switch ve Network Ürünleri", "serial"),
    ("ELK", "Elektrik Ekipmanları", "quantity"),
    ("MNT", "Montaj Malzemeleri", "quantity"),
    ("ACC", "Teknik Aksesuarlar", "quantity"),
    ("SW", "Yazılım ve Dijital Lisanslar", "serial"),
    ("FUR", "Mobilya ve Ofis Ekipmanları", "serial"),
    ("CON", "Sarf Malzemeleri", "quantity"),
    ("OTH", "Diğer", "quantity"),
]

DEFAULT_WAREHOUSES: list[tuple[str, str, str]] = [
    ("WH-CENTRAL", "Merkez Depo", "central"),
    ("WH-WORKSHOP", "Teknik Atölye", "workshop"),
    ("WH-OFFICE", "Ofis", "office"),
    ("WH-PROJECT", "Proje Deposu", "project"),
    ("WH-SERVICE", "Servis Alanı", "service"),
]

DEFAULT_CURRENCIES: list[tuple[str, str, str, Decimal]] = [
    ("TRY", "Türk Lirası", "₺", Decimal("1.000000")),
    ("USD", "ABD Doları", "$", Decimal("35.000000")),
    ("EUR", "Euro", "€", Decimal("38.000000")),
]


def seed_core(db: Session) -> None:
    """İdempotent: izinler, sistem rolleri, ilk admin, kategoriler, depolar, döviz kurları ve sistem lisansı."""
    s = get_settings()
    tid = uuid.UUID(s.default_tenant_id)
    perms = {p.code: p for p in db.scalars(select(Permission))}
    for m, acts in MODULES.items():
        for a in acts:
            code = f"{m}.{a}"
            if code not in perms:
                perms[code] = Permission(code=code, module=m, action=a)
                db.add(perms[code])
    db.flush()
    roles = {r.code: r for r in db.scalars(select(Role).where(Role.tenant_id == tid))}
    for code, spec in SYSTEM_ROLES.items():
        role = roles.get(code)
        if not role:
            role = Role(tenant_id=tid, code=code, name=spec["name"], is_system=True)
            db.add(role)
            roles[code] = role
        role.permissions = [perms[c] for c in spec["perms"]]
    db.flush()
    if not db.scalar(select(User).where(User.tenant_id == tid, User.email == s.first_admin_email)):
        db.add(
            User(
                tenant_id=tid,
                email=s.first_admin_email,
                full_name="Sistem Yöneticisi",
                password_hash=hash_password(s.first_admin_password),
                is_superuser=True,
                roles=[roles["ADMIN"]],
            )
        )
    existing_cats = {c.code: c for c in db.scalars(select(Category).where(Category.tenant_id == tid))}
    for code, name, tracking in DEFAULT_CATEGORIES:
        if code not in existing_cats:
            db.add(Category(tenant_id=tid, code=code, name=name, tracking_type=tracking))

    existing_whs = {w.code: w for w in db.scalars(select(Warehouse).where(Warehouse.tenant_id == tid))}
    for wcode, wname, wtype in DEFAULT_WAREHOUSES:
        if wcode not in existing_whs:
            db.add(Warehouse(tenant_id=tid, code=wcode, name=wname, warehouse_type=wtype))

    existing_currs = {c.code: c for c in db.scalars(select(Currency))}
    for ccode, cname, csym, default_rate in DEFAULT_CURRENCIES:
        if ccode not in existing_currs:
            db.add(Currency(code=ccode, name=cname, symbol=csym))
            db.flush()
        has_rate = db.scalar(
            select(ExchangeRate).where(ExchangeRate.tenant_id == tid, ExchangeRate.currency_code == ccode)
        )
        if not has_rate:
            db.add(
                ExchangeRate(
                    tenant_id=tid,
                    rate_date=date.today(),
                    currency_code=ccode,
                    rate_to_try=default_rate,
                    source="manual",
                    note="Varsayılan başlangıç kuru",
                )
            )

    if not db.scalar(select(AppLicense).where(AppLicense.tenant_id == tid)):
        default_key = "KUP-ENT-2026-PROD-MASTER"
        sig = hashlib.sha256(f"{default_key}:{s.secret_key}".encode()).hexdigest()
        db.add(
            AppLicense(
                tenant_id=tid,
                customer_name="KÜP Prodüksiyon",
                edition="Enterprise Unlimited",
                license_key_hash=hashlib.sha256(default_key.encode()).hexdigest(),
                license_key_masked="KUP-****-****-STER",
                max_users=250,
                max_assets=100000,
                features={"offline_lan": True, "pdf_reports": True, "qr_system": True, "multi_warehouse": True},
                issued_at=date.today(),
                expires_at=None,
                signature=sig,
                is_active=True,
            )
        )

    db.commit()
