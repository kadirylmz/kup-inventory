import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TrackingType = Literal["serial", "quantity"]
CurrencyCode = Literal["TRY", "EUR", "USD"]
AssetStatus = Literal[
    "active", "in_warehouse", "in_project", "assigned", "faulty", "in_service", "scrapped", "passive"
]
AssetCondition = Literal["new", "excellent", "good", "fair", "poor"]


# --- CATEGORY ---
class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    code: str = Field(min_length=2, max_length=50, pattern=r"^[A-Z0-9_-]+$")
    parent_id: uuid.UUID | None = None
    tracking_type: TrackingType = "serial"
    icon: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=500)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    parent_id: uuid.UUID | None = None
    tracking_type: TrackingType | None = None
    icon: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    code: str
    parent_id: uuid.UUID | None
    tracking_type: str
    icon: str | None
    description: str | None
    is_active: bool
    product_count: int = 0


# --- BRAND & MODEL ---
class BrandCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    country: str | None = Field(default=None, max_length=80)
    website: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=500)


class BrandUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    country: str | None = Field(default=None, max_length=80)
    website: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class BrandOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    country: str | None
    website: str | None
    description: str | None
    is_active: bool
    model_count: int = 0


class ModelCreate(BaseModel):
    brand_id: uuid.UUID
    name: str = Field(min_length=1, max_length=150)
    specs: dict[str, str] | None = None
    description: str | None = Field(default=None, max_length=500)


class ModelUpdate(BaseModel):
    brand_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=150)
    specs: dict[str, str] | None = None
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class ModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    brand_id: uuid.UUID
    brand_name: str = ""
    name: str
    specs: dict | None
    description: str | None
    is_active: bool


# --- SUPPLIER ---
class SupplierCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    contact_person: str | None = Field(default=None, max_length=120)
    tax_no: str | None = Field(default=None, max_length=50)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = None
    notes: str | None = None


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    contact_person: str | None = None
    tax_no: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    contact_person: str | None
    tax_no: str | None
    phone: str | None
    email: str | None
    address: str | None
    notes: str | None
    is_active: bool


# --- ATTRIBUTES, IMAGES & DOCUMENTS ---
class AttributeItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=500)


class ImageOut(BaseModel):
    id: uuid.UUID
    file_id: uuid.UUID
    url: str
    original_name: str
    caption: str | None
    is_primary: bool
    created_at: datetime


class DocumentOut(BaseModel):
    id: uuid.UUID
    file_id: uuid.UUID
    url: str
    original_name: str
    doc_type: str
    title: str
    size_bytes: int
    created_at: datetime


# --- PRODUCT ---
class ProductCreate(BaseModel):
    inventory_code: str | None = Field(default=None, max_length=60)
    name: str = Field(min_length=2, max_length=200)
    category_id: uuid.UUID
    subcategory_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    brand_name: str | None = Field(default=None, max_length=120)
    model_id: uuid.UUID | None = None
    model_name: str | None = Field(default=None, max_length=150)
    tracking_type: TrackingType = "serial"
    unit: str = Field(default="Adet", max_length=30)
    barcode: str | None = Field(default=None, max_length=100)
    description: str | None = None
    technical_specs: dict[str, str] | None = None
    attributes: list[AttributeItem] = []
    min_stock: Decimal = Field(default=Decimal("0"), ge=0)
    quantity: Decimal = Field(default=Decimal("0"), ge=0)

    purchase_date: date | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0)
    purchase_currency: CurrencyCode = "TRY"
    vat_rate: Decimal = Field(default=Decimal("20.00"), ge=0, le=100)
    supplier_id: uuid.UUID | None = None
    invoice_no: str | None = Field(default=None, max_length=100)
    warranty_start: date | None = None
    warranty_end: date | None = None

    current_market_value: Decimal | None = Field(default=None, ge=0)
    market_value_currency: CurrencyCode = "TRY"
    last_valuation_date: date | None = None

    status: AssetStatus = "in_warehouse"
    is_fixture: bool = False
    warehouse_name: str | None = Field(default=None, max_length=120)
    shelf_section: str | None = Field(default=None, max_length=120)
    location_detail: str | None = Field(default=None, max_length=180)
    internal_notes: str | None = None

    # Seri numarası bazlı ürün oluşturulurken tek seferde toplu cihaz seri numaraları da verilebilir
    initial_serial_numbers: list[str] = []


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    category_id: uuid.UUID | None = None
    subcategory_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    brand_name: str | None = Field(default=None, max_length=120)
    model_id: uuid.UUID | None = None
    model_name: str | None = Field(default=None, max_length=150)
    unit: str | None = Field(default=None, max_length=30)
    barcode: str | None = Field(default=None, max_length=100)
    description: str | None = None
    technical_specs: dict[str, str] | None = None
    attributes: list[AttributeItem] | None = None
    min_stock: Decimal | None = Field(default=None, ge=0)
    quantity: Decimal | None = Field(default=None, ge=0)

    purchase_date: date | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0)
    purchase_currency: CurrencyCode | None = None
    vat_rate: Decimal | None = Field(default=None, ge=0, le=100)
    supplier_id: uuid.UUID | None = None
    invoice_no: str | None = Field(default=None, max_length=100)
    warranty_start: date | None = None
    warranty_end: date | None = None

    current_market_value: Decimal | None = Field(default=None, ge=0)
    market_value_currency: CurrencyCode | None = None
    last_valuation_date: date | None = None

    status: AssetStatus | None = None
    warehouse_name: str | None = Field(default=None, max_length=120)
    shelf_section: str | None = Field(default=None, max_length=120)
    location_detail: str | None = Field(default=None, max_length=180)
    internal_notes: str | None = None
    is_active: bool | None = None
    is_fixture: bool | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    inventory_code: str
    name: str
    category_id: uuid.UUID
    category_name: str = ""
    subcategory_id: uuid.UUID | None
    subcategory_name: str | None = None
    brand_id: uuid.UUID | None
    brand_name: str | None = None
    model_id: uuid.UUID | None
    model_name: str | None = None
    tracking_type: str
    unit: str
    barcode: str | None
    description: str | None
    technical_specs: dict | None
    attributes: list[AttributeItem] = []
    min_stock: Decimal
    quantity: Decimal
    serial_asset_count: int = 0

    purchase_date: date | None
    purchase_price: Decimal | None
    purchase_currency: str
    vat_rate: Decimal
    supplier_id: uuid.UUID | None
    supplier_name: str | None = None
    invoice_no: str | None
    warranty_start: date | None
    warranty_end: date | None

    current_market_value: Decimal | None
    market_value_currency: str
    last_valuation_date: date | None

    status: str
    warehouse_name: str | None
    shelf_section: str | None
    location_detail: str | None
    internal_notes: str | None
    primary_image_url: str | None = None
    active_projects_summary: str | None = None
    assigned_summary: str | None = None
    assigned_quantity: Decimal = Decimal("0")
    warehouse_quantity: Decimal = Decimal("0")
    is_active: bool
    is_fixture: bool = False
    created_at: datetime


# --- ASSET (SERİ NUMARALI FİZİKSEL VARLIK) ---
class AssetCreate(BaseModel):
    product_id: uuid.UUID
    inventory_code: str | None = Field(default=None, max_length=80)
    serial_number: str = Field(min_length=1, max_length=120)
    barcode: str | None = Field(default=None, max_length=120)
    status: AssetStatus = "in_warehouse"
    condition: AssetCondition = "excellent"
    warehouse_name: str | None = Field(default=None, max_length=120)
    shelf_section: str | None = Field(default=None, max_length=120)
    location_detail: str | None = Field(default=None, max_length=180)
    purchase_date: date | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0)
    purchase_currency: CurrencyCode = "TRY"
    vat_rate: Decimal = Field(default=Decimal("20.00"), ge=0, le=100)
    supplier_id: uuid.UUID | None = None
    invoice_no: str | None = Field(default=None, max_length=100)
    warranty_start: date | None = None
    warranty_end: date | None = None
    current_market_value: Decimal | None = Field(default=None, ge=0)
    market_value_currency: CurrencyCode = "TRY"
    notes: str | None = None


class AssetBulkCreate(BaseModel):
    """Aynı modelden birden fazla seri numaralı cihazı tek işlemde kaydetmek için."""

    product_id: uuid.UUID
    serial_numbers: list[str] = Field(min_length=1, max_length=200)
    status: AssetStatus = "in_warehouse"
    condition: AssetCondition = "excellent"
    warehouse_name: str | None = Field(default=None, max_length=120)
    shelf_section: str | None = Field(default=None, max_length=120)
    location_detail: str | None = Field(default=None, max_length=180)
    purchase_date: date | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0)
    purchase_currency: CurrencyCode = "TRY"
    vat_rate: Decimal = Field(default=Decimal("20.00"), ge=0, le=100)
    supplier_id: uuid.UUID | None = None
    invoice_no: str | None = Field(default=None, max_length=100)
    warranty_start: date | None = None
    warranty_end: date | None = None
    current_market_value: Decimal | None = Field(default=None, ge=0)
    market_value_currency: CurrencyCode = "TRY"
    notes: str | None = None


class AssetUpdate(BaseModel):
    serial_number: str | None = Field(default=None, min_length=1, max_length=120)
    barcode: str | None = Field(default=None, max_length=120)
    status: AssetStatus | None = None
    condition: AssetCondition | None = None
    warehouse_name: str | None = Field(default=None, max_length=120)
    shelf_section: str | None = Field(default=None, max_length=120)
    location_detail: str | None = Field(default=None, max_length=180)
    purchase_date: date | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0)
    purchase_currency: CurrencyCode | None = None
    warranty_start: date | None = None
    warranty_end: date | None = None
    current_market_value: Decimal | None = Field(default=None, ge=0)
    market_value_currency: CurrencyCode | None = None
    last_valuation_date: date | None = None
    notes: str | None = None
    is_active: bool | None = None


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str = ""
    brand_name: str | None = None
    model_name: str | None = None
    category_name: str = ""
    inventory_code: str
    serial_number: str
    barcode: str | None
    qr_token: str
    status: str
    condition: str
    warehouse_name: str | None
    shelf_section: str | None
    location_detail: str | None
    assigned_project_name: str | None
    assigned_employee_name: str | None
    purchase_date: date | None
    purchase_price: Decimal | None
    purchase_currency: str
    vat_rate: Decimal
    supplier_id: uuid.UUID | None
    supplier_name: str | None = None
    invoice_no: str | None
    warranty_start: date | None
    warranty_end: date | None
    current_market_value: Decimal | None
    market_value_currency: str
    last_valuation_date: date | None
    primary_image_url: str | None = None
    notes: str | None
    is_active: bool
    created_at: datetime
