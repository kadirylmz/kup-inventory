import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ProjectStatus = Literal["planned", "active", "completed", "cancelled"]
LicenseType = Literal[
    "perpetual", "annual", "monthly", "per_user", "per_device", "per_server", "per_project"
]
ServiceResult = Literal["in_service", "repaired", "unrepairable", "replaced"]


# ==========================================
# 1. PROJECT SCHEMAS
# ==========================================
class ProjectCreate(BaseModel):
    code: str = Field(min_length=2, max_length=50)
    name: str = Field(min_length=2, max_length=180)
    customer: str | None = Field(default=None, max_length=180)
    start_date: date | None = None
    end_date: date | None = None
    manager_employee_id: uuid.UUID | None = None
    manager_name: str | None = Field(default=None, max_length=150)
    address: str | None = None
    status: ProjectStatus = "active"
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    customer: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    manager_employee_id: uuid.UUID | None = None
    manager_name: str | None = None
    address: str | None = None
    status: ProjectStatus | None = None
    description: str | None = None


class ProjectEquipmentSendItem(BaseModel):
    product_id: uuid.UUID
    asset_id: uuid.UUID | None = None
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    note: str | None = None


class ProjectEquipmentSendIn(BaseModel):
    from_warehouse_id: uuid.UUID | None = None
    items: list[ProjectEquipmentSendItem] = Field(min_length=1)
    note: str | None = None


class ProjectEquipmentReturnIn(BaseModel):
    project_asset_id: uuid.UUID
    returned_quantity: Decimal = Field(default=Decimal("1"), gt=0)
    to_warehouse_id: uuid.UUID | None = None
    note: str | None = None


class ProjectAssetOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    inventory_code: str
    unit: str
    asset_id: uuid.UUID | None
    serial_number: str | None
    quantity: Decimal
    returned_quantity: Decimal
    remaining_in_project: Decimal
    status: str
    purchase_cost_total: Decimal
    purchase_currency: str
    market_value_total: Decimal
    market_value_currency: str
    sent_at: datetime
    returned_at: datetime | None
    note: str | None


class ProjectOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    customer: str | None
    start_date: date | None
    end_date: date | None
    manager_employee_id: uuid.UUID | None
    manager_name: str | None
    address: str | None
    status: str
    description: str | None
    total_sent_items: int = 0
    still_in_project_items: int = 0
    returned_items: int = 0
    purchase_cost_by_currency: dict[str, float] = {}
    market_value_by_currency: dict[str, float] = {}
    equipment: list[ProjectAssetOut] = []


# ==========================================
# 2. SOFTWARE LICENSE SCHEMAS
# ==========================================
class LicenseCreate(BaseModel):
    software_name: str = Field(min_length=2, max_length=150)
    vendor: str = Field(min_length=1, max_length=120)
    version: str | None = Field(default=None, max_length=60)
    license_type: LicenseType = "annual"
    license_key: str = Field(min_length=2, max_length=500)
    license_no: str | None = Field(default=None, max_length=100)
    purchase_date: date | None = None
    start_date: date | None = None
    end_date: date | None = None
    seats_total: int = Field(default=1, ge=1)
    seats_used: int = Field(default=0, ge=0)
    assigned_asset_id: uuid.UUID | None = None
    assigned_employee_id: uuid.UUID | None = None
    assigned_project_id: uuid.UUID | None = None
    cost: Decimal = Field(default=Decimal("0"), ge=0)
    currency: Literal["TRY", "EUR", "USD"] = "USD"
    supplier_id: uuid.UUID | None = None
    invoice_no: str | None = None
    contract_no: str | None = None
    notes: str | None = None


class LicenseRenewalIn(BaseModel):
    new_end_date: date
    cost: Decimal = Field(default=Decimal("0"), ge=0)
    currency: Literal["TRY", "EUR", "USD"] = "USD"
    invoice_no: str | None = None
    note: str | None = None


class LicenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    software_name: str
    vendor: str
    version: str | None
    license_type: str
    key_masked: str
    license_no: str | None
    purchase_date: date | None
    start_date: date | None
    end_date: date | None
    days_remaining: int | None = None
    expiry_alert_level: str | None = None  # 7_days, 15_days, 30_days, expired, ok
    seats_total: int
    seats_used: int
    assigned_asset_id: uuid.UUID | None
    assigned_asset_name: str | None = None
    assigned_employee_id: uuid.UUID | None
    assigned_employee_name: str | None = None
    cost: Decimal
    currency: str
    supplier_id: uuid.UUID | None
    supplier_name: str | None = None
    invoice_no: str | None
    contract_no: str | None
    notes: str | None
    status: str


# ==========================================
# 3. MAINTENANCE & SERVICE SCHEMAS
# ==========================================
class ServiceCreate(BaseModel):
    product_id: uuid.UUID
    asset_id: uuid.UUID | None = None
    fault_type: str = Field(min_length=2, max_length=120)
    fault_description: str = Field(min_length=2)
    service_company: str | None = Field(default=None, max_length=180)
    sent_date: date
    return_date: date | None = None
    labor_cost: Decimal = Field(default=Decimal("0"), ge=0)
    parts_cost: Decimal = Field(default=Decimal("0"), ge=0)
    currency: Literal["TRY", "EUR", "USD"] = "TRY"
    warranty_covered: bool = False
    service_report: str | None = None
    result: ServiceResult = "in_service"


class ServiceUpdate(BaseModel):
    return_date: date | None = None
    labor_cost: Decimal | None = Field(default=None, ge=0)
    parts_cost: Decimal | None = Field(default=None, ge=0)
    warranty_covered: bool | None = None
    service_report: str | None = None
    result: ServiceResult | None = None


class ServiceOut(BaseModel):
    id: uuid.UUID
    service_no: str
    product_id: uuid.UUID
    product_name: str
    inventory_code: str
    asset_id: uuid.UUID | None
    serial_number: str | None
    fault_type: str
    fault_description: str
    service_company: str | None
    sent_date: date
    return_date: date | None
    labor_cost: Decimal
    parts_cost: Decimal
    total_cost: Decimal
    currency: str
    warranty_covered: bool
    service_report: str | None
    result: str
    created_at: datetime


class MaintenanceCreate(BaseModel):
    product_id: uuid.UUID
    asset_id: uuid.UUID | None = None
    maintenance_type: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=2)
    performed_date: date
    next_maintenance_date: date | None = None
    cost: Decimal = Field(default=Decimal("0"), ge=0)
    currency: Literal["TRY", "EUR", "USD"] = "TRY"
    technician_name: str | None = None


class MaintenanceOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    asset_id: uuid.UUID | None
    serial_number: str | None
    maintenance_type: str
    description: str
    performed_date: date
    next_maintenance_date: date | None
    cost: Decimal
    currency: str
    technician_name: str | None
