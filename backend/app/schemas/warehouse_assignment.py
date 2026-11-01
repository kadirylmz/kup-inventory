import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

WarehouseType = Literal["central", "workshop", "office", "project", "service"]
LocationKind = Literal["shelf", "section", "area"]
MovementType = Literal[
    "initial",
    "purchase",
    "manual_in",
    "out",
    "to_project",
    "from_project",
    "transfer",
    "assign",
    "unassign",
    "to_service",
    "from_service",
    "scrap",
    "count_diff",
    "adjustment",
    "reversal",
]


# --- WAREHOUSE & LOCATION ---
class LocationCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=120)
    kind: LocationKind = "shelf"
    parent_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=255)


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    warehouse_id: uuid.UUID
    parent_id: uuid.UUID | None
    code: str
    name: str
    kind: str
    description: str | None
    is_active: bool


class WarehouseCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    warehouse_type: WarehouseType = "central"
    address: str | None = None
    manager_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=500)


class WarehouseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    warehouse_type: WarehouseType | None = None
    address: str | None = None
    manager_name: str | None = None
    phone: str | None = None
    description: str | None = None
    is_active: bool | None = None


class WarehouseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    name: str
    warehouse_type: str
    address: str | None
    manager_name: str | None
    phone: str | None
    description: str | None
    is_active: bool
    locations: list[LocationOut] = []


class StockBalanceOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    inventory_code: str
    unit: str
    warehouse_id: uuid.UUID
    warehouse_name: str
    location_id: uuid.UUID | None
    location_name: str | None
    quantity: Decimal
    source_type: str = "warehouse"  # 'warehouse', 'project', 'assignment'
    source_detail: str | None = None  # e.g. "Proje: Sahne Kurulumu" or "Zimmet: Ahmet Yılmaz"


class StockBalanceUpdate(BaseModel):
    quantity: Decimal = Field(ge=0)
    location_id: uuid.UUID | None = None


# --- STOCK MOVEMENTS ---
class MovementCreate(BaseModel):
    movement_type: MovementType
    product_id: uuid.UUID
    asset_id: uuid.UUID | None = None
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    from_warehouse_id: uuid.UUID | None = None
    from_location_id: uuid.UUID | None = None
    to_warehouse_id: uuid.UUID | None = None
    to_location_id: uuid.UUID | None = None
    employee_id: uuid.UUID | None = None
    project_name: str | None = Field(default=None, max_length=180)
    note: str | None = None


class MovementReverseIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class MovementItemOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    inventory_code: str
    asset_id: uuid.UUID | None
    serial_number: str | None
    quantity: Decimal
    previous_location_text: str | None
    new_location_text: str | None


class MovementOut(BaseModel):
    id: uuid.UUID
    movement_no: str
    movement_type: str
    from_warehouse_name: str | None
    to_warehouse_name: str | None
    employee_name: str | None
    project_name: str | None
    performed_by_name: str
    occurred_at: datetime
    note: str | None
    reverses_id: uuid.UUID | None
    is_reversed: bool
    items: list[MovementItemOut] = []


# --- TRANSFERS (ONAYLI DEPOLAR ARASI TRANSFER) ---
class TransferCreate(BaseModel):
    from_warehouse_id: uuid.UUID
    from_location_id: uuid.UUID | None = None
    to_warehouse_id: uuid.UUID
    to_location_id: uuid.UUID | None = None
    product_id: uuid.UUID
    asset_id: uuid.UUID | None = None
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    note: str | None = None


class TransferOut(BaseModel):
    id: uuid.UUID
    transfer_no: str
    status: str
    from_warehouse_id: uuid.UUID
    from_warehouse_name: str
    from_location_name: str | None
    to_warehouse_id: uuid.UUID
    to_warehouse_name: str
    to_location_name: str | None
    product_id: uuid.UUID
    product_name: str
    asset_id: uuid.UUID | None
    serial_number: str | None
    quantity: Decimal
    requested_by_name: str
    approved_by_name: str | None
    created_at: datetime
    approved_at: datetime | None
    note: str | None


# --- DEPARTMENTS & EMPLOYEES (PERSONEL) ---
class DepartmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    parent_id: uuid.UUID | None = None


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None


class EmployeeCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    department_id: uuid.UUID | None = None
    position: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)


class EmployeeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    department_id: uuid.UUID | None = None
    position: str | None = None
    email: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str
    department_id: uuid.UUID | None
    department_name: str | None = None
    position: str | None
    email: str | None
    phone: str | None
    is_active: bool
    active_assignment_count: int = 0


# --- ASSIGNMENTS (ZİMMET YÖNETİMİ) ---
class AssignmentItemIn(BaseModel):
    product_id: uuid.UUID
    asset_id: uuid.UUID | None = None
    quantity: Decimal = Field(default=Decimal("1"), gt=0)


class AssignmentCreate(BaseModel):
    employee_id: uuid.UUID
    from_warehouse_id: uuid.UUID | None = None
    expected_return_date: datetime | None = None
    note: str | None = None
    items: list[AssignmentItemIn] = Field(min_length=1)


class AssignmentReturnIn(BaseModel):
    assignment_item_id: uuid.UUID
    returned_quantity: Decimal = Field(default=Decimal("1"), gt=0)
    to_warehouse_id: uuid.UUID | None = None
    condition_on_return: str = "good"
    note: str | None = None


class AssignmentItemOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    inventory_code: str
    asset_id: uuid.UUID | None
    serial_number: str | None
    quantity: Decimal
    returned_quantity: Decimal
    is_returned: bool
    returned_at: datetime | None


class AssignmentOut(BaseModel):
    id: uuid.UUID
    assignment_no: str
    employee_id: uuid.UUID
    employee_name: str
    employee_department: str | None
    employee_position: str | None
    delivered_by_name: str
    delivered_at: datetime
    expected_return_date: datetime | None
    status: str
    note: str | None
    items: list[AssignmentItemOut] = []
