import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
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
from app.models.core import Employee, User
from app.models.inventory import Asset, Product, Supplier
from app.models.warehouse_assignment import StockMovement


# ==========================================
# 1. PROJECT MANAGEMENT
# ==========================================
class Project(BaseMixin, Base):
    """Şirketin yürüttüğü müze, sergi, prodüksiyon ve kurulum projeleri."""

    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("tenant_id", "code"),)

    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    customer: Mapped[str | None] = mapped_column(String(180))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    manager_employee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), index=True)
    manager_name: Mapped[str | None] = mapped_column(String(150))
    address: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(30), default="active", nullable=False, index=True
    )  # planned, active, completed, cancelled
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    manager: Mapped[Employee | None] = relationship(lazy="selectin")
    project_assets: Mapped[list["ProjectAsset"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="selectin"
    )


class ProjectAsset(Base):
    """Projeye gönderilen ekipmanlar (seri numaralı cihaz veya adet bazlı ürün/kablo) ve iade durumu."""

    __tablename__ = "project_assets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("1"), nullable=False)
    returned_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("0"), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default="in_project", nullable=False, index=True
    )  # in_project, partial_returned, returned
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(500))

    project: Mapped[Project] = relationship(back_populates="project_assets")
    product: Mapped[Product] = relationship(lazy="selectin")
    asset: Mapped[Asset | None] = relationship(lazy="selectin")


class ProjectMovement(Base):
    """Projeyle ilişkili stok hareketlerinin bağ tablosu."""

    __tablename__ = "project_movements"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    movement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="CASCADE"), nullable=False, index=True
    )

    movement: Mapped[StockMovement] = relationship(lazy="selectin")


# ==========================================
# 2. SOFTWARE LICENSE MANAGEMENT
# ==========================================
class SoftwareProduct(BaseMixin, Base):
    """Yazılım ürün kataloğu (Resolume Arena, Windows Server, Adobe CC vb.)."""

    __tablename__ = "software_products"
    __table_args__ = (UniqueConstraint("tenant_id", "name", "version"),)

    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    vendor: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    version: Mapped[str | None] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(String(500))


class SoftwareLicense(BaseMixin, Base):
    """
    Şifreli yazılım lisans kaydı.
    Lisans türleri: perpetual, annual, monthly, per_user, per_device, per_server, per_project
    """

    __tablename__ = "software_licenses"

    software_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("software_products.id"), nullable=False, index=True
    )
    software_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    vendor: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str | None] = mapped_column(String(60))
    license_type: Mapped[str] = mapped_column(String(40), default="annual", nullable=False, index=True)

    # Hassas veri: AES/Fernet ile şifreli saklanır
    key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    key_masked: Mapped[str] = mapped_column(String(80), nullable=False)
    license_no: Mapped[str | None] = mapped_column(String(100), index=True)

    purchase_date: Mapped[date | None] = mapped_column(Date)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, index=True)

    seats_total: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    seats_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    assigned_asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)
    assigned_employee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), index=True)
    assigned_project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"), index=True)

    cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("suppliers.id"))
    invoice_no: Mapped[str | None] = mapped_column(String(100))
    contract_no: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)  # active, expired, cancelled
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    software_product: Mapped[SoftwareProduct] = relationship(lazy="selectin")
    assigned_asset: Mapped[Asset | None] = relationship(lazy="selectin")
    assigned_employee: Mapped[Employee | None] = relationship(lazy="selectin")
    supplier: Mapped[Supplier | None] = relationship(lazy="selectin")
    renewals: Mapped[list["LicenseRenewal"]] = relationship(
        back_populates="license", cascade="all, delete-orphan", lazy="selectin"
    )


class LicenseAssignment(Base):
    """Yazılım lisansının cihazlara veya personellere atanma geçmişi."""

    __tablename__ = "license_assignments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    license_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("software_licenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)
    employee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), index=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(255))


class LicenseRenewal(Base):
    """Yazılım lisansı yenileme kayıtları."""

    __tablename__ = "license_renewals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    license_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("software_licenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    renewed_at: Mapped[date] = mapped_column(Date, nullable=False)
    previous_end_date: Mapped[date | None] = mapped_column(Date)
    new_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    invoice_no: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(String(500))

    license: Mapped[SoftwareLicense] = relationship(back_populates="renewals")


# ==========================================
# 3. MAINTENANCE & SERVICE MODULE
# ==========================================
class ServiceRecord(BaseMixin, Base):
    """Fiziksel varlık arıza ve dış/iç teknik servis kaydı."""

    __tablename__ = "service_records"

    service_no: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)

    fault_type: Mapped[str] = mapped_column(String(120), nullable=False)
    fault_description: Mapped[str] = mapped_column(Text, nullable=False)
    service_company: Mapped[str | None] = mapped_column(String(180))
    sent_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    return_date: Mapped[date | None] = mapped_column(Date)

    labor_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"), nullable=False)
    parts_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"), nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="TRY", nullable=False)

    warranty_covered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    service_report: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str] = mapped_column(
        String(40), default="in_service", nullable=False, index=True
    )  # in_service, repaired, unrepairable, replaced
    performed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    product: Mapped[Product] = relationship(lazy="selectin")
    asset: Mapped[Asset | None] = relationship(lazy="selectin")


class MaintenanceRecord(BaseMixin, Base):
    """Cihaz periyodik bakım kaydı (filtre temizliği, kalibrasyon, termal bakım vb.)."""

    __tablename__ = "maintenance_records"

    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)
    maintenance_type: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    performed_date: Mapped[date] = mapped_column(Date, nullable=False)
    next_maintenance_date: Mapped[date | None] = mapped_column(Date, index=True)
    cost: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="TRY", nullable=False)
    technician_name: Mapped[str | None] = mapped_column(String(150))

    product: Mapped[Product] = relationship(lazy="selectin")
    asset: Mapped[Asset | None] = relationship(lazy="selectin")


class MaintenanceSchedule(BaseMixin, Base):
    """Periyodik bakım takvimi."""

    __tablename__ = "maintenance_schedules"

    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    interval_days: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    last_done_date: Mapped[date | None] = mapped_column(Date)
    next_due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    asset: Mapped[Asset] = relationship(lazy="selectin")
