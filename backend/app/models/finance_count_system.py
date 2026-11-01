import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, BaseMixin
from app.models.core import User
from app.models.inventory import Asset, Product, Supplier
from app.models.warehouse_assignment import Warehouse


# ==========================================
# 1. FINANCE (PHASE 5: KUR, ALIŞ, DEĞERLEME, AMORTİSMAN)
# ==========================================
class Currency(Base):
    """Desteklenen para birimleri: TRY, EUR, USD."""

    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    symbol: Mapped[str] = mapped_column(String(10), nullable=False)


class ExchangeRate(BaseMixin, Base):
    """
    Döviz kuru tablosu.
    İnternet olmadan manuel kur girilebilir; geçmiş raporlar tarihsel kurları korur.
    """

    __tablename__ = "exchange_rates"
    __table_args__ = (UniqueConstraint("tenant_id", "rate_date", "currency_code"),)

    rate_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    currency_code: Mapped[str] = mapped_column(ForeignKey("currencies.code"), nullable=False, index=True)
    rate_to_try: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="manual", nullable=False)
    note: Mapped[str | None] = mapped_column(String(255))


class PurchaseRecord(Base):
    """
    Değiştirilemez (Immutable) Alış Maliyeti Kaydı.
    Alış maliyeti doğrudan değiştirilemez; düzeltmeler correction_of_id ile yeni kayıt olarak eklenir.
    """

    __tablename__ = "purchase_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="TRY", nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("20.00"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("1"), nullable=False)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("suppliers.id"))
    invoice_no: Mapped[str | None] = mapped_column(String(100))
    correction_of_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("purchase_records.id"), index=True)
    reason: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped[Product] = relationship(lazy="selectin")
    asset: Mapped[Asset | None] = relationship(lazy="selectin")
    supplier: Mapped[Supplier | None] = relationship(lazy="selectin")


class Valuation(Base):
    """
    Append-only İkinci El Piyasa Değerleme Kaydı (Geçmiş değerlemeler silinmez).
    status = 'proposed' -> Araştırma / Öneri (Kullanıcı onaylamadan ürünün piyasa değerini değiştirmez)
    status = 'approved' -> Onaylandı ve ürüne/varlığa uygulandı
    """

    __tablename__ = "valuations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)

    brand_name: Mapped[str | None] = mapped_column(String(120))
    model_name: Mapped[str | None] = mapped_column(String(150))
    condition: Mapped[str] = mapped_column(String(30), default="excellent", nullable=False)
    market_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="TRY", nullable=False)
    valuation_source: Mapped[str] = mapped_column(String(150), nullable=False)
    valuation_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(Text)

    status: Mapped[str] = mapped_column(
        String(30), default="approved", nullable=False, index=True
    )  # proposed | approved | rejected
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped[Product] = relationship(lazy="selectin")
    asset: Mapped[Asset | None] = relationship(lazy="selectin")


class DepreciationRecord(BaseMixin, Base):
    """Muhasebesel Net Defter Değeri ve Amortisman Kaydı."""

    __tablename__ = "depreciation_records"

    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)
    method: Mapped[str] = mapped_column(String(40), default="straight_line", nullable=False)
    useful_life_years: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    purchase_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="TRY", nullable=False)
    annual_depreciation: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    accumulated_depreciation: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    net_book_value: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    calculated_for_year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    product: Mapped[Product] = relationship(lazy="selectin")
    asset: Mapped[Asset | None] = relationship(lazy="selectin")


# ==========================================
# 2. COUNT / SAYIM MODÜLÜ (PHASE 6)
# ==========================================
class Stocktake(BaseMixin, Base):
    """Depo fiziksel sayım oturumu."""

    __tablename__ = "stocktakes"
    __table_args__ = (UniqueConstraint("tenant_id", "stocktake_no"),)

    stocktake_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False, index=True)
    count_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    responsible_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default="counting", nullable=False, index=True
    )  # counting, review, approved, cancelled
    note: Mapped[str | None] = mapped_column(Text)

    warehouse: Mapped[Warehouse] = relationship(lazy="selectin")
    responsible: Mapped[User] = relationship(lazy="selectin")
    items: Mapped[list["StocktakeItem"]] = relationship(
        back_populates="stocktake", cascade="all, delete-orphan", lazy="selectin"
    )
    approvals: Mapped[list["StocktakeApproval"]] = relationship(
        back_populates="stocktake", cascade="all, delete-orphan", lazy="selectin"
    )


class StocktakeItem(Base):
    """
    Sayım kalemi ve karşılaştırma sonucu.
    result: found (Bulunan), missing (Eksik), extra (Fazla), wrong_location (Yanlış lokasyon), serial_mismatch (Seri no uyuşmazlığı)
    """

    __tablename__ = "stocktake_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    stocktake_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stocktakes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"), index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)
    scanned_serial_or_qr: Mapped[str | None] = mapped_column(String(120))
    expected_warehouse_name: Mapped[str | None] = mapped_column(String(120))
    found_warehouse_name: Mapped[str | None] = mapped_column(String(120))
    expected_qty: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("1"), nullable=False)
    counted_qty: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("0"), nullable=False)
    result: Mapped[str] = mapped_column(
        String(40), default="missing", nullable=False, index=True
    )  # found, missing, extra, wrong_location, serial_mismatch
    note: Mapped[str | None] = mapped_column(String(255))

    stocktake: Mapped[Stocktake] = relationship(back_populates="items")
    product: Mapped[Product | None] = relationship(lazy="selectin")
    asset: Mapped[Asset | None] = relationship(lazy="selectin")


class StocktakeApproval(Base):
    """Sayım onay ve stok düzeltme kaydı."""

    __tablename__ = "stocktake_approvals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    stocktake_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stocktakes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    approved_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    adjustments_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))

    stocktake: Mapped[Stocktake] = relationship(back_populates="approvals")
    approver: Mapped[User] = relationship(lazy="selectin")


# ==========================================
# 3. SYSTEM (PHASE 7 & 8: BİLDİRİM, YEDEKLEME, UYGULAMA LİSANSI)
# ==========================================
class Notification(BaseMixin, Base):
    """Uygulama içi yetki bazlı bildirim merkezi."""

    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    target_permission: Mapped[str | None] = mapped_column(String(80), index=True)
    category: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # license_expiry, warranty_expiry, maintenance_due, service_delay, project_unreturned, assignment_overdue, low_stock, count_diff, valuation_update, new_action
    severity: Mapped[str] = mapped_column(String(20), default="info", nullable=False)  # info, warning, critical
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str | None] = mapped_column(String(200))
    dedupe_key: Mapped[str | None] = mapped_column(String(150), index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BackupRecord(BaseMixin, Base):
    """Veritabanı ve dosya yedekleme geçmişi."""

    __tablename__ = "backup_records"

    backup_no: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    backup_type: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)  # auto, manual
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sha256: Mapped[str | None] = mapped_column(String(64))
    included_uploads: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="completed", nullable=False)  # completed, failed, restored
    error_message: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class AppLicense(BaseMixin, Base):
    """Ticari KÜP INVENTORY uygulama lisansı (başka şirketlere lisanslama altyapısı)."""

    __tablename__ = "app_licenses"

    customer_name: Mapped[str] = mapped_column(String(180), nullable=False)
    edition: Mapped[str] = mapped_column(String(60), default="Enterprise", nullable=False)
    license_key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    license_key_masked: Mapped[str] = mapped_column(String(60), nullable=False)
    max_users: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    max_assets: Mapped[int] = mapped_column(Integer, default=50000, nullable=False)
    features: Mapped[dict | None] = mapped_column(JSON)
    issued_at: Mapped[date] = mapped_column(Date, nullable=False)
    expires_at: Mapped[date | None] = mapped_column(Date)
    signature: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    activations: Mapped[list["AppLicenseActivation"]] = relationship(
        back_populates="app_license", cascade="all, delete-orphan", lazy="selectin"
    )


class AppLicenseActivation(Base):
    """Uygulama lisansının sunucu donanım/makine aktivasyon kaydı."""

    __tablename__ = "app_license_activations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    app_license_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("app_licenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    machine_fingerprint: Mapped[str] = mapped_column(String(128), nullable=False)
    hostname: Mapped[str | None] = mapped_column(String(120))
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    activated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    app_license: Mapped[AppLicense] = relationship(back_populates="activations")
