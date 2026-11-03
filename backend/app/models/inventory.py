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


class FileAttachment(BaseMixin, Base):
    """Sunucu üzerinde saklanan ürün fotoğrafları ve belgeler."""

    __tablename__ = "file_attachments"

    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    owner_type: Mapped[str | None] = mapped_column(String(50), index=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)


class Category(BaseMixin, Base):
    """Ürün kategorileri ve alt kategorileri (ağaç yapısı)."""

    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("tenant_id", "code"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"), index=True)
    tracking_type: Mapped[str] = mapped_column(String(20), default="serial", nullable=False)  # serial | quantity
    icon: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Brand(BaseMixin, Base):
    """Üretici markalar (Panasonic, Sony, Resolume, Blackmagic vb.)."""

    __tablename__ = "brands"
    __table_args__ = (UniqueConstraint("tenant_id", "name"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    country: Mapped[str | None] = mapped_column(String(80))
    website: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ProductModel(BaseMixin, Base):
    """Markaya bağlı ürün modelleri (ör. PT-RZ690B)."""

    __tablename__ = "models"
    __table_args__ = (UniqueConstraint("tenant_id", "brand_id", "name"),)

    brand_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("brands.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    specs: Mapped[dict | None] = mapped_column(JSON)
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    brand: Mapped[Brand] = relationship(lazy="selectin")


class Supplier(BaseMixin, Base):
    """Tedarikçi firmalar."""

    __tablename__ = "suppliers"
    __table_args__ = (UniqueConstraint("tenant_id", "name"),)

    name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    contact_person: Mapped[str | None] = mapped_column(String(120))
    tax_no: Mapped[str | None] = mapped_column(String(50))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Product(BaseMixin, Base):
    """
    Ürün / Katalog kartı.
    tracking_type = 'serial' -> Fiziksel tekil cihazlar ASSETS tablosunda seri numarasıyla takip edilir.
    tracking_type = 'quantity' -> Adet/metre bazlı sarf ve kablo ürünleri toplam miktar ve depo bakiyesiyle takip edilir.
    """

    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("tenant_id", "inventory_code"),)

    inventory_code: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), nullable=False, index=True)
    subcategory_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"), index=True)
    brand_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("brands.id"), index=True)
    model_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("models.id"), index=True)
    tracking_type: Mapped[str] = mapped_column(String(20), default="serial", nullable=False)  # serial | quantity
    unit: Mapped[str] = mapped_column(String(30), default="Adet", nullable=False)  # Adet, Metre, Set, Paket, Kutu
    barcode: Mapped[str | None] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    technical_specs: Mapped[dict | None] = mapped_column(JSON)
    min_stock: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("0"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("0"), nullable=False)

    # Finansal & Satın Alma Referans Bilgileri (Varsayılan / İlk Giriş)
    purchase_date: Mapped[date | None] = mapped_column(Date)
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    purchase_currency: Mapped[str] = mapped_column(String(3), default="TRY", nullable=False)  # TRY, USD, EUR
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("20.00"), nullable=False)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("suppliers.id"), index=True)
    invoice_no: Mapped[str | None] = mapped_column(String(100))
    warranty_start: Mapped[date | None] = mapped_column(Date)
    warranty_end: Mapped[date | None] = mapped_column(Date)

    # Güncel İkinci El Piyasa Değerlemesi
    current_market_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    market_value_currency: Mapped[str] = mapped_column(String(3), default="TRY", nullable=False)
    last_valuation_date: Mapped[date | None] = mapped_column(Date)

    # Varsayılan Konum & Durum
    status: Mapped[str] = mapped_column(String(30), default="in_warehouse", nullable=False)
    warehouse_name: Mapped[str | None] = mapped_column(String(120))
    shelf_section: Mapped[str | None] = mapped_column(String(120))
    location_detail: Mapped[str | None] = mapped_column(String(180))
    internal_notes: Mapped[str | None] = mapped_column(Text)
    primary_image_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("file_attachments.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_fixture: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    category: Mapped[Category] = relationship(foreign_keys=[category_id], lazy="selectin")
    subcategory: Mapped[Category | None] = relationship(foreign_keys=[subcategory_id], lazy="selectin")
    brand: Mapped[Brand | None] = relationship(lazy="selectin")
    model: Mapped[ProductModel | None] = relationship(lazy="selectin")
    supplier: Mapped[Supplier | None] = relationship(lazy="selectin")
    attributes: Mapped[list["ProductAttribute"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin"
    )


class ProductAttribute(Base):
    """Ürüne özel dinamik teknik özellik anahtar/değer çiftleri."""

    __tablename__ = "product_attributes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(String(500), nullable=False)

    product: Mapped[Product] = relationship(back_populates="attributes")


class Asset(BaseMixin, Base):
    """
    Seri numarası bazlı tekil fiziksel varlık kaydı.
    Örn: Panasonic PT-RZ690B ürününün SN001, SN002 seri numaralı her bir cihazı.
    """

    __tablename__ = "assets"
    __table_args__ = (
        UniqueConstraint("tenant_id", "inventory_code"),
        UniqueConstraint("tenant_id", "serial_number"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    inventory_code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    serial_number: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    barcode: Mapped[str | None] = mapped_column(String(120), index=True)
    qr_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    # Durum: active, in_warehouse, in_project, assigned, faulty, in_service, scrapped, passive
    status: Mapped[str] = mapped_column(String(30), default="in_warehouse", nullable=False, index=True)
    condition: Mapped[str] = mapped_column(String(30), default="excellent", nullable=False)  # new, excellent, good, fair, poor

    # Konum bilgileri (Phase 3'te warehouse_id / location_id FK'leri ile de bağlanır)
    warehouse_name: Mapped[str | None] = mapped_column(String(120), index=True)
    shelf_section: Mapped[str | None] = mapped_column(String(120))
    location_detail: Mapped[str | None] = mapped_column(String(180))
    assigned_project_name: Mapped[str | None] = mapped_column(String(180))
    assigned_employee_name: Mapped[str | None] = mapped_column(String(150))

    # Cihaza özel satın alma & değerleme
    purchase_date: Mapped[date | None] = mapped_column(Date)
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    purchase_currency: Mapped[str] = mapped_column(String(3), default="TRY", nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("20.00"), nullable=False)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("suppliers.id"), index=True)
    invoice_no: Mapped[str | None] = mapped_column(String(100))
    warranty_start: Mapped[date | None] = mapped_column(Date)
    warranty_end: Mapped[date | None] = mapped_column(Date)

    current_market_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    market_value_currency: Mapped[str] = mapped_column(String(3), default="TRY", nullable=False)
    last_valuation_date: Mapped[date | None] = mapped_column(Date)

    primary_image_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("file_attachments.id"))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    product: Mapped[Product] = relationship(lazy="selectin")
    supplier: Mapped[Supplier | None] = relationship(lazy="selectin")


class ProductImage(Base):
    """Ürün veya tekil varlığa ait fotoğraflar."""

    __tablename__ = "product_images"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    file_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("file_attachments.id", ondelete="CASCADE"), nullable=False)
    caption: Mapped[str | None] = mapped_column(String(255))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    file: Mapped[FileAttachment] = relationship(lazy="selectin")


class ProductDocument(Base):
    """Ürüne veya varlığa ait fatura, kullanım kılavuzu, garanti belgesi vb. dökümanlar."""

    __tablename__ = "product_documents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    file_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("file_attachments.id", ondelete="CASCADE"), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), default="other")  # invoice, warranty, manual, datasheet, other
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    file: Mapped[FileAttachment] = relationship(lazy="selectin")
