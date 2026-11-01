import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
     Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
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
from app.models.inventory import Asset, Product


class Warehouse(BaseMixin, Base):
    """Depolar: Merkez depo, Teknik atölye, Ofis, Proje deposu, Servis alanı."""

    __tablename__ = "warehouses"
    __table_args__ = (UniqueConstraint("tenant_id", "code"),)

    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    warehouse_type: Mapped[str] = mapped_column(
        String(30), default="central", nullable=False
    )  # central, workshop, office, project, service
    address: Mapped[str | None] = mapped_column(Text)
    manager_name: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    locations: Mapped[list["WarehouseLocation"]] = relationship(
        back_populates="warehouse", cascade="all, delete-orphan", lazy="selectin"
    )


class WarehouseLocation(BaseMixin, Base):
    """Depo içerisindeki raf, bölüm veya alan tanımları."""

    __tablename__ = "warehouse_locations"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", "code"),)

    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouse_locations.id"), index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), default="shelf", nullable=False)  # shelf, section, area
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    warehouse: Mapped[Warehouse] = relationship(back_populates="locations")


class StockBalance(BaseMixin, Base):
    """Adet bazlı ürünlerin depo ve raf/bölüm bazındaki stok bakiyeleri (negatif olamaz)."""

    __tablename__ = "stock_balances"
    __table_args__ = (
        UniqueConstraint("tenant_id", "product_id", "warehouse_id", "location_id"),
        CheckConstraint("quantity >= 0", name="ck_stock_balance_non_negative"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False, index=True)
    location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouse_locations.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("0"), nullable=False)

    product: Mapped[Product] = relationship(lazy="selectin")
    warehouse: Mapped[Warehouse] = relationship(lazy="selectin")
    location: Mapped[WarehouseLocation | None] = relationship(lazy="selectin")


class StockMovement(Base):
    """
    Append-only stok hareket kaydı. Geriye dönük silinmez.
    Yanlış işlemler için reverses_id ile ters işlem (reversal) oluşturulur.
    """

    __tablename__ = "stock_movements"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    movement_no: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    movement_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    # Türler: initial, purchase, manual_in, out, to_project, from_project, transfer,
    # assign, unassign, to_service, from_service, scrap, count_diff, adjustment, reversal

    from_warehouse_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouses.id"), index=True)
    from_location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouse_locations.id"))
    to_warehouse_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouses.id"), index=True)
    to_location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouse_locations.id"))

    employee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("employees.id"), index=True)
    project_name: Mapped[str | None] = mapped_column(String(180))
    performed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    note: Mapped[str | None] = mapped_column(Text)
    reverses_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stock_movements.id"), index=True)
    is_reversed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    from_warehouse: Mapped[Warehouse | None] = relationship(foreign_keys=[from_warehouse_id], lazy="selectin")
    to_warehouse: Mapped[Warehouse | None] = relationship(foreign_keys=[to_warehouse_id], lazy="selectin")
    from_location: Mapped[WarehouseLocation | None] = relationship(foreign_keys=[from_location_id], lazy="selectin")
    to_location: Mapped[WarehouseLocation | None] = relationship(foreign_keys=[to_location_id], lazy="selectin")
    employee: Mapped[Employee | None] = relationship(lazy="selectin")
    user: Mapped[User] = relationship(lazy="selectin")
    items: Mapped[list["StockMovementItem"]] = relationship(
        back_populates="movement", cascade="all, delete-orphan", lazy="selectin"
    )


class StockMovementItem(Base):
    """Stok hareketinin ürün / seri numaralı varlık kalemleri."""

    __tablename__ = "stock_movement_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    movement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stock_movements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("1"), nullable=False)
    previous_location_text: Mapped[str | None] = mapped_column(String(200))
    new_location_text: Mapped[str | None] = mapped_column(String(200))

    movement: Mapped[StockMovement] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(lazy="selectin")
    asset: Mapped[Asset | None] = relationship(lazy="selectin")


class Transfer(BaseMixin, Base):
    """
    Depolar arası transfer onay kaydı.
    Transfer onaylanmadan (status != 'approved') ürün/varlık lokasyonu değişmez!
    """

    __tablename__ = "transfers"
    __table_args__ = (UniqueConstraint("tenant_id", "transfer_no"),)

    transfer_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    from_warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False, index=True)
    from_location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouse_locations.id"))
    to_warehouse_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warehouses.id"), nullable=False, index=True)
    to_location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouse_locations.id"))

    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("1"), nullable=False)

    status: Mapped[str] = mapped_column(
        String(30), default="pending", nullable=False, index=True
    )  # pending, approved, rejected
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    movement_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stock_movements.id"))
    note: Mapped[str | None] = mapped_column(Text)

    from_warehouse: Mapped[Warehouse] = relationship(foreign_keys=[from_warehouse_id], lazy="selectin")
    to_warehouse: Mapped[Warehouse] = relationship(foreign_keys=[to_warehouse_id], lazy="selectin")
    from_location: Mapped[WarehouseLocation | None] = relationship(foreign_keys=[from_location_id], lazy="selectin")
    to_location: Mapped[WarehouseLocation | None] = relationship(foreign_keys=[to_location_id], lazy="selectin")
    product: Mapped[Product] = relationship(lazy="selectin")
    asset: Mapped[Asset | None] = relationship(lazy="selectin")
    requester: Mapped[User] = relationship(foreign_keys=[requested_by], lazy="selectin")
    approver: Mapped[User | None] = relationship(foreign_keys=[approved_by], lazy="selectin")


class Assignment(BaseMixin, Base):
    """Personel zimmet teslim fişi."""

    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("tenant_id", "assignment_no"),)

    assignment_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False, index=True)
    delivered_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    delivered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expected_return_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(
        String(30), default="active", nullable=False, index=True
    )  # active, partial_returned, returned
    document_file_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("file_attachments.id"))
    note: Mapped[str | None] = mapped_column(Text)

    employee: Mapped[Employee] = relationship(lazy="selectin")
    delivered_by: Mapped[User] = relationship(lazy="selectin")
    items: Mapped[list["AssignmentItem"]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan", lazy="selectin"
    )


class AssignmentItem(Base):
    """Zimmet fişindeki ürün/seri numaralı cihaz satırları."""

    __tablename__ = "assignment_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("1"), nullable=False)
    returned_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("0"), nullable=False)
    is_returned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    assignment: Mapped[Assignment] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(lazy="selectin")
    asset: Mapped[Asset | None] = relationship(lazy="selectin")
    returns: Mapped[list["AssignmentReturn"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", lazy="selectin"
    )


class AssignmentReturn(Base):
    """Zimmet iade işlem kaydı."""

    __tablename__ = "assignment_returns"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    assignment_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignment_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    returned_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False)
    to_warehouse_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("warehouses.id"))
    received_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    returned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    condition_on_return: Mapped[str] = mapped_column(String(30), default="good")
    note: Mapped[str | None] = mapped_column(Text)

    item: Mapped[AssignmentItem] = relationship(back_populates="returns")
