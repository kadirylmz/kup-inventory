import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_permission, write_audit
from app.db.session import get_db
from app.models.core import Department, Employee, User
from app.models.inventory import Asset, Product
from app.models.warehouse_assignment import (
    Assignment,
    AssignmentItem,
    AssignmentReturn,
    StockBalance,
    StockMovement,
    StockMovementItem,
    Transfer,
    Warehouse,
    WarehouseLocation,
)
from app.schemas.warehouse_assignment import (
    AssignmentCreate,
    AssignmentItemOut,
    AssignmentOut,
    AssignmentReturnIn,
    DepartmentCreate,
    DepartmentOut,
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
    LocationCreate,
    LocationOut,
    MovementCreate,
    MovementItemOut,
    MovementOut,
    MovementReverseIn,
    StockBalanceOut,
    StockBalanceUpdate,
    TransferCreate,
    TransferOut,
    WarehouseCreate,
    WarehouseOut,
    WarehouseUpdate,
)

router = APIRouter(tags=["warehouse & assignment"])


def _next_no(db: Session, model, col, prefix: str) -> str:
    from app.models.core import Setting

    row = db.scalar(select(Setting).where(Setting.key == "general"))
    digits = 2
    if row and isinstance(row.value, dict):
        try:
            digits = max(1, min(6, int(row.value.get("code_padding_digits", 2))))
        except (TypeError, ValueError):
            digits = 2
    cnt = db.scalar(select(func.count(model.id))) or 0
    seq = cnt + 1
    while True:
        code = f"{prefix}-{seq:0{digits}d}"
        if not db.scalar(select(model.id).where(col == code)):
            return code
        seq += 1


def _adjust_balance(
    db: Session,
    tenant_id: uuid.UUID,
    product: Product,
    warehouse_id: uuid.UUID,
    location_id: uuid.UUID | None,
    delta: Decimal,
) -> StockBalance:
    bal = db.scalar(
        select(StockBalance).where(
            StockBalance.tenant_id == tenant_id,
            StockBalance.product_id == product.id,
            StockBalance.warehouse_id == warehouse_id,
            StockBalance.location_id == location_id,
        )
    )
    if not bal:
        if delta < 0:
            # Eğer ürün doğrudan Envanter Kataloğundan quantity > 0 olarak girildiyse ve henüz StockBalance satırı yoksa:
            existing_sum = (
                db.scalar(
                    select(func.coalesce(func.sum(StockBalance.quantity), 0)).where(
                        StockBalance.tenant_id == tenant_id,
                        StockBalance.product_id == product.id,
                    )
                )
                or Decimal("0")
            )
            untracked_qty = max(Decimal("0"), (product.quantity or Decimal("0")) - Decimal(str(existing_sum)))
            if untracked_qty >= abs(delta):
                bal = StockBalance(
                    tenant_id=tenant_id,
                    product_id=product.id,
                    warehouse_id=warehouse_id,
                    location_id=location_id,
                    quantity=untracked_qty,
                )
                db.add(bal)
                db.flush()
            else:
                raise HTTPException(
                    422,
                    f"'{product.name}' için seçilen depoda yeterli stok yok (Mevcut: {untracked_qty}).",
                )
        else:
            bal = StockBalance(
                tenant_id=tenant_id,
                product_id=product.id,
                warehouse_id=warehouse_id,
                location_id=location_id,
                quantity=Decimal("0"),
            )
            db.add(bal)
            db.flush()

    new_qty = bal.quantity + delta
    if new_qty < 0:
        raise HTTPException(
            422,
            f"Stok negatif değere düşemez! '{product.name}' mevcut bakiye: {bal.quantity}, istenen çıkış: {abs(delta)}",
        )
    bal.quantity = new_qty
    db.flush()

    # Katalog toplam miktarını da senkronize et (Depo + Zimmet + Proje)
    _sync_product_quantity_from_balances(db, tenant_id, product)
    db.flush()
    return bal


def _to_warehouse_out(db: Session, tenant_id: uuid.UUID, wh: Warehouse) -> WarehouseOut:
    wo = WarehouseOut.model_validate(wh)
    # 1. Depo bakiyeleri (StockBalance)
    sb_sum = (
        db.scalar(
            select(func.coalesce(func.sum(StockBalance.quantity), 0)).where(
                StockBalance.tenant_id == tenant_id,
                StockBalance.warehouse_id == wh.id,
            )
        )
        or Decimal("0")
    )
    # 2. Bu depodaki seri numaralı cihazlar
    asset_count = (
        db.scalar(
            select(func.count(Asset.id)).where(
                Asset.tenant_id == tenant_id,
                Asset.is_deleted.is_(False),
                Asset.warehouse_name == wh.name,
            )
        )
        or 0
    )

    # 3. Ofis deposu ise aktif zimmetler
    asg_sum = Decimal("0")
    if wh.warehouse_type == "office":
        asg_sum = (
            db.scalar(
                select(func.coalesce(func.sum(AssignmentItem.quantity - AssignmentItem.returned_quantity), 0))
                .join(Assignment, Assignment.id == AssignmentItem.assignment_id)
                .where(
                    Assignment.tenant_id == tenant_id,
                    Assignment.is_deleted.is_(False),
                    AssignmentItem.is_returned.is_(False),
                )
            )
            or Decimal("0")
        )

    # 4. Proje deposu ise aktif projelerdeki ekipmanlar
    proj_sum = Decimal("0")
    if wh.warehouse_type == "project":
        from app.models.project_license_maintenance import ProjectAsset
        proj_sum = (
            db.scalar(
                select(func.coalesce(func.sum(ProjectAsset.quantity - ProjectAsset.returned_quantity), 0)).where(
                    ProjectAsset.tenant_id == tenant_id,
                    ProjectAsset.status == "in_project",
                )
            )
            or Decimal("0")
        )

    total_qty = sb_sum + Decimal(str(asset_count)) + asg_sum + proj_sum
    wo.total_quantity = total_qty
    wo.total_device_count = int(total_qty)
    return wo


# ==========================================
# 1. WAREHOUSES & LOCATIONS
# ==========================================
@router.get("/warehouses", response_model=list[WarehouseOut])
def list_warehouses(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("warehouse.view")),
):
    whs = db.scalars(
        select(Warehouse)
        .where(Warehouse.tenant_id == me.tenant_id, Warehouse.is_deleted.is_(False))
        .order_by(Warehouse.name)
    ).all()
    return [_to_warehouse_out(db, me.tenant_id, w) for w in whs]


@router.post("/warehouses", response_model=WarehouseOut, status_code=201)
def create_warehouse(
    body: WarehouseCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("warehouse.manage")),
):
    code = body.code.strip().upper()
    if db.scalar(select(Warehouse).where(Warehouse.tenant_id == me.tenant_id, Warehouse.code == code)):
        raise HTTPException(409, "Bu depo kodu zaten kullanımda.")
    wh = Warehouse(
        tenant_id=me.tenant_id,
        code=code,
        name=body.name.strip(),
        warehouse_type=body.warehouse_type,
        address=body.address,
        manager_name=body.manager_name,
        phone=body.phone,
        description=body.description,
    )
    db.add(wh)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="warehouse.create",
        entity="warehouse",
        entity_id=wh.id,
        new={"code": wh.code, "name": wh.name},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(wh)
    return wh


@router.patch("/warehouses/{warehouse_id}", response_model=WarehouseOut)
def update_warehouse(
    warehouse_id: uuid.UUID,
    body: WarehouseUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("warehouse.manage")),
):
    wh = db.get(Warehouse, warehouse_id)
    if not wh or wh.tenant_id != me.tenant_id or wh.is_deleted:
        raise HTTPException(404, "Depo bulunamadı.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(wh, k, v)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="warehouse.update",
        entity="warehouse",
        entity_id=wh.id,
        new=body.model_dump(exclude_unset=True),
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(wh)
    return wh


@router.post("/warehouses/{warehouse_id}/locations", response_model=LocationOut, status_code=201)
def create_warehouse_location(
    warehouse_id: uuid.UUID,
    body: LocationCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("warehouse.manage")),
):
    wh = db.get(Warehouse, warehouse_id)
    if not wh or wh.tenant_id != me.tenant_id or wh.is_deleted:
        raise HTTPException(404, "Depo bulunamadı.")
    code = body.code.strip().upper()
    if db.scalar(
        select(WarehouseLocation).where(
            WarehouseLocation.tenant_id == me.tenant_id,
            WarehouseLocation.warehouse_id == warehouse_id,
            WarehouseLocation.code == code,
        )
    ):
        raise HTTPException(409, "Bu depoda aynı raf/bölüm kodu zaten var.")
    loc = WarehouseLocation(
        tenant_id=me.tenant_id,
        warehouse_id=warehouse_id,
        parent_id=body.parent_id,
        code=code,
        name=body.name.strip(),
        kind=body.kind,
        description=body.description,
    )
    db.add(loc)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="warehouse.location_create",
        entity="warehouse_location",
        entity_id=loc.id,
        new={"warehouse": wh.name, "code": loc.code, "name": loc.name},
        ip=client_ip(request),
    )
    db.commit()
    return loc


@router.get("/warehouses/stock", response_model=list[StockBalanceOut])
def list_warehouse_stock(
    warehouse_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("warehouse.view")),
):
    selected_wh = db.get(Warehouse, warehouse_id) if warehouse_id else None

    # Normal depo stok bakiyeleri
    q = select(StockBalance).where(StockBalance.tenant_id == me.tenant_id, StockBalance.quantity > 0)
    if warehouse_id:
        q = q.where(StockBalance.warehouse_id == warehouse_id)
    rows = db.scalars(q).all()

    results: list[StockBalanceOut] = [
        StockBalanceOut(
            id=r.id,
            product_id=r.product_id,
            product_name=r.product.name if r.product else "",
            inventory_code=r.product.inventory_code if r.product else "",
            unit=r.product.unit if r.product else "Adet",
            warehouse_id=r.warehouse_id,
            warehouse_name=r.warehouse.name if r.warehouse else "",
            location_id=r.location_id,
            location_name=r.location.name if r.location else None,
            quantity=r.quantity,
            source_type="warehouse",
            source_detail=r.location.name if r.location else None,
        )
        for r in rows
        if not r.product or not r.product.is_deleted
    ]

    # Eğer seçili depo veya filtrelenen depo 'office' (Ofis) ise: Personel zimmetindeki ürünleri de göster
    if selected_wh and selected_wh.warehouse_type == "office":
        asg_items = db.scalars(
            select(AssignmentItem)
            .join(Assignment, Assignment.id == AssignmentItem.assignment_id)
            .where(
                Assignment.tenant_id == me.tenant_id,
                Assignment.is_deleted.is_(False),
                AssignmentItem.is_returned.is_(False),
            )
        ).all()
        for ai in asg_items:
            rem = ai.quantity - ai.returned_quantity
            if rem > 0 and ai.product and not ai.product.is_deleted:
                emp_name = ai.assignment.employee.full_name if (ai.assignment and ai.assignment.employee) else "Personel"
                asg_no = ai.assignment.assignment_no if ai.assignment else ""
                results.append(
                    StockBalanceOut(
                        id=ai.id,
                        product_id=ai.product_id,
                        product_name=ai.product.name,
                        inventory_code=ai.product.inventory_code,
                        unit=ai.product.unit or "Adet",
                        warehouse_id=selected_wh.id,
                        warehouse_name=selected_wh.name,
                        location_id=None,
                        location_name=f"Zimmette: {emp_name}",
                        quantity=rem,
                        source_type="assignment",
                        source_detail=f"Zimmet No: {asg_no} ({emp_name})",
                    )
                )

    # Eğer seçili depo veya filtrelenen depo 'project' (Proje Deposu) ise: Projelerdeki aktif ürünleri de göster
    if selected_wh and selected_wh.warehouse_type == "project":
        from app.models.project_license_maintenance import ProjectAsset
        proj_items = db.scalars(
            select(ProjectAsset).where(
                ProjectAsset.tenant_id == me.tenant_id,
                ProjectAsset.status == "in_project",
            )
        ).all()
        for pa in proj_items:
            rem = pa.quantity - pa.returned_quantity
            if rem > 0 and pa.product and not pa.product.is_deleted:
                proj_name = pa.project.name if pa.project else "Proje"
                results.append(
                    StockBalanceOut(
                        id=pa.id,
                        product_id=pa.product_id,
                        product_name=pa.product.name,
                        inventory_code=pa.product.inventory_code,
                        unit=pa.product.unit or "Adet",
                        warehouse_id=selected_wh.id,
                        warehouse_name=selected_wh.name,
                        location_id=None,
                        location_name=f"Projede: {proj_name}",
                        quantity=rem,
                        source_type="project",
                        source_detail=f"Proje: {proj_name}",
                    )
                )

    return results


def _sync_product_quantity_from_balances(db: Session, tenant_id: uuid.UUID, product: Product | None) -> None:
    if product and product.tracking_type == "quantity":
        wh_qty = (
            db.scalar(
                select(func.coalesce(func.sum(StockBalance.quantity), 0)).where(
                    StockBalance.tenant_id == tenant_id,
                    StockBalance.product_id == product.id,
                )
            )
            or Decimal("0")
        )
        asg_qty = (
            db.scalar(
                select(func.coalesce(func.sum(AssignmentItem.quantity - AssignmentItem.returned_quantity), 0)).where(
                    AssignmentItem.product_id == product.id,
                    AssignmentItem.is_returned.is_(False),
                )
            )
            or Decimal("0")
        )
        # Projeye gidenler envanterden düşer, ofisteki zimmettekiler şirkette kalmaya devam ettiği için envantere dahildir
        product.quantity = Decimal(str(wh_qty + asg_qty))


@router.patch("/warehouses/stock/{balance_id}", response_model=StockBalanceOut)
def update_warehouse_stock(
    balance_id: uuid.UUID,
    body: StockBalanceUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("warehouse.manage")),
):
    bal = db.get(StockBalance, balance_id)
    if not bal or bal.tenant_id != me.tenant_id:
        raise HTTPException(404, "Stok bakiye kaydı bulunamadı.")
    old_qty = bal.quantity
    bal.quantity = body.quantity
    if "location_id" in body.model_dump(exclude_unset=True):
        bal.location_id = body.location_id
    db.flush()
    _sync_product_quantity_from_balances(db, me.tenant_id, bal.product)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="warehouse.stock_update",
        entity="stock_balance",
        entity_id=bal.id,
        old={"quantity": str(old_qty)},
        new={"quantity": str(bal.quantity)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(bal)
    return StockBalanceOut(
        id=bal.id,
        product_id=bal.product_id,
        product_name=bal.product.name if bal.product else "",
        inventory_code=bal.product.inventory_code if bal.product else "",
        unit=bal.product.unit if bal.product else "Adet",
        warehouse_id=bal.warehouse_id,
        warehouse_name=bal.warehouse.name if bal.warehouse else "",
        location_id=bal.location_id,
        location_name=bal.location.name if bal.location else None,
        quantity=bal.quantity,
    )


@router.delete("/warehouses/stock/{balance_id}")
def delete_warehouse_stock(
    balance_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("warehouse.manage")),
):
    bal = db.get(StockBalance, balance_id)
    if not bal or bal.tenant_id != me.tenant_id:
        raise HTTPException(404, "Stok bakiye kaydı bulunamadı.")
    prod = bal.product
    old_info = {
        "product": prod.name if prod else str(bal.product_id),
        "warehouse": bal.warehouse.name if bal.warehouse else str(bal.warehouse_id),
        "quantity": str(bal.quantity),
    }
    db.delete(bal)
    db.flush()
    _sync_product_quantity_from_balances(db, me.tenant_id, prod)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="warehouse.stock_delete",
        entity="stock_balance",
        entity_id=balance_id,
        old=old_info,
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


@router.delete("/warehouses/{warehouse_id}/locations/{location_id}")
def delete_warehouse_location(
    warehouse_id: uuid.UUID,
    location_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("warehouse.manage")),
):
    loc = db.get(WarehouseLocation, location_id)
    if not loc or loc.tenant_id != me.tenant_id or loc.warehouse_id != warehouse_id:
        raise HTTPException(404, "Raf/bölüm bulunamadı.")
    for sb in db.scalars(select(StockBalance).where(StockBalance.location_id == location_id)):
        sb.location_id = None
    db.delete(loc)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="warehouse.location_delete",
        entity="warehouse_location",
        entity_id=location_id,
        old={"code": loc.code, "name": loc.name},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


@router.delete("/warehouses/{warehouse_id}")
def delete_warehouse(
    warehouse_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("warehouse.manage")),
):
    wh = db.get(Warehouse, warehouse_id)
    if not wh or wh.tenant_id != me.tenant_id or wh.is_deleted:
        raise HTTPException(404, "Depo bulunamadı.")
    wh.is_deleted = True
    wh.is_active = False
    for sb in db.scalars(select(StockBalance).where(StockBalance.warehouse_id == warehouse_id)):
        prod = sb.product
        db.delete(sb)
        db.flush()
        _sync_product_quantity_from_balances(db, me.tenant_id, prod)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="warehouse.delete",
        entity="warehouse",
        entity_id=wh.id,
        old={"code": wh.code, "name": wh.name},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


# ==========================================
# 2. STOCK MOVEMENTS & REVERSALS
# ==========================================
INBOUND_TYPES = {"initial", "purchase", "manual_in", "from_project", "unassign", "from_service"}
OUTBOUND_TYPES = {"out", "to_project", "assign", "to_service", "scrap"}


def _to_movement_out(m: StockMovement) -> MovementOut:
    return MovementOut(
        id=m.id,
        movement_no=m.movement_no,
        movement_type=m.movement_type,
        from_warehouse_name=m.from_warehouse.name if m.from_warehouse else None,
        to_warehouse_name=m.to_warehouse.name if m.to_warehouse else None,
        employee_name=m.employee.full_name if m.employee else None,
        project_name=m.project_name,
        performed_by_name=m.user.full_name if m.user else "",
        occurred_at=m.occurred_at,
        note=m.note,
        reverses_id=m.reverses_id,
        is_reversed=m.is_reversed,
        items=[
            MovementItemOut(
                id=i.id,
                product_id=i.product_id,
                product_name=i.product.name if i.product else "",
                inventory_code=i.product.inventory_code if i.product else "",
                asset_id=i.asset_id,
                serial_number=i.asset.serial_number if i.asset else None,
                quantity=i.quantity,
                previous_location_text=i.previous_location_text,
                new_location_text=i.new_location_text,
            )
            for i in m.items
        ],
    )


@router.get("/movements", response_model=list[MovementOut])
def list_movements(
    movement_type: str | None = None,
    product_id: uuid.UUID | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("movement.view")),
):
    q = select(StockMovement).where(StockMovement.tenant_id == me.tenant_id)
    if movement_type:
        q = q.where(StockMovement.movement_type == movement_type)
    if product_id:
        q = q.join(StockMovementItem).where(StockMovementItem.product_id == product_id)
    rows = db.scalars(q.order_by(StockMovement.occurred_at.desc()).limit(min(limit, 500))).all()
    return [_to_movement_out(m) for m in rows]


@router.post("/movements", response_model=MovementOut, status_code=201)
def create_movement(
    body: MovementCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("movement.create")),
):
    if body.movement_type == "transfer":
        raise HTTPException(
            400, "Depolar arası transfer işlemleri '/api/v1/transfers' üzerinden onay sürecine tabi olarak yapılmalıdır."
        )

    prod = db.get(Product, body.product_id)
    if not prod or prod.tenant_id != me.tenant_id or prod.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")

    asset: Asset | None = None
    if body.asset_id:
        asset = db.get(Asset, body.asset_id)
        if not asset or asset.tenant_id != me.tenant_id or asset.product_id != prod.id:
            raise HTTPException(404, "Seri numaralı varlık bulunamadı.")

    from_wh = db.get(Warehouse, body.from_warehouse_id) if body.from_warehouse_id else None
    to_wh = db.get(Warehouse, body.to_warehouse_id) if body.to_warehouse_id else None
    from_loc = db.get(WarehouseLocation, body.from_location_id) if body.from_location_id else None
    to_loc = db.get(WarehouseLocation, body.to_location_id) if body.to_location_id else None

    prev_loc_str = (
        f"{asset.warehouse_name or ''} / {asset.shelf_section or ''}".strip(" /")
        if asset
        else (f"{from_wh.name if from_wh else (prod.warehouse_name or '')}")
    )

    # Adet bazlı veya depo bakiye güncellemesi
    if body.movement_type in INBOUND_TYPES:
        if not to_wh:
            raise HTTPException(422, "Giriş işlemlerinde hedef depo seçilmelidir.")
        if prod.tracking_type == "quantity":
            _adjust_balance(db, me.tenant_id, prod, to_wh.id, to_loc.id if to_loc else None, body.quantity)
        prod.warehouse_name = to_wh.name
        if to_loc:
            prod.shelf_section = to_loc.name
    elif body.movement_type in OUTBOUND_TYPES:
        if prod.tracking_type == "quantity":
            if not from_wh:
                raise HTTPException(422, "Çıkış işlemlerinde kaynak depo seçilmelidir.")
            _adjust_balance(db, me.tenant_id, prod, from_wh.id, from_loc.id if from_loc else None, -body.quantity)
    elif body.movement_type in {"count_diff", "adjustment"}:
        if prod.tracking_type == "quantity":
            if to_wh:
                _adjust_balance(db, me.tenant_id, prod, to_wh.id, to_loc.id if to_loc else None, body.quantity)
            elif from_wh:
                _adjust_balance(db, me.tenant_id, prod, from_wh.id, from_loc.id if from_loc else None, -body.quantity)

    # Seri numaralı varlık durum & lokasyon güncellemesi
    new_loc_str = to_wh.name if to_wh else (body.project_name or "")
    if asset:
        if to_wh:
            asset.warehouse_name = to_wh.name
            asset.shelf_section = to_loc.name if to_loc else None
        status_map = {
            "initial": "in_warehouse",
            "purchase": "in_warehouse",
            "manual_in": "in_warehouse",
            "from_project": "in_warehouse",
            "unassign": "in_warehouse",
            "from_service": "in_warehouse",
            "to_project": "in_project",
            "assign": "assigned",
            "to_service": "in_service",
            "scrap": "scrapped",
            "out": "active",
        }
        if body.movement_type in status_map:
            asset.status = status_map[body.movement_type]
        if body.project_name:
            asset.assigned_project_name = body.project_name

    mov = StockMovement(
        tenant_id=me.tenant_id,
        movement_no=_next_no(db, StockMovement, StockMovement.movement_no, "MOV"),
        movement_type=body.movement_type,
        from_warehouse_id=body.from_warehouse_id,
        from_location_id=body.from_location_id,
        to_warehouse_id=body.to_warehouse_id,
        to_location_id=body.to_location_id,
        employee_id=body.employee_id,
        project_name=body.project_name,
        performed_by=me.id,
        note=body.note,
        items=[
            StockMovementItem(
                product_id=prod.id,
                asset_id=asset.id if asset else None,
                quantity=body.quantity if not asset else Decimal("1"),
                previous_location_text=prev_loc_str or None,
                new_location_text=new_loc_str or None,
            )
        ],
    )
    db.add(mov)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action=f"movement.{body.movement_type}",
        entity="stock_movement",
        entity_id=mov.id,
        new={"movement_no": mov.movement_no, "product": prod.name, "qty": str(body.quantity)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(mov)
    return _to_movement_out(mov)


@router.post("/movements/{movement_id}/reverse", response_model=MovementOut, status_code=201)
def reverse_movement(
    movement_id: uuid.UUID,
    body: MovementReverseIn,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("movement.approve")),
):
    """Hareket geçmişi silinmez; yanlış işlem için ters işlem (reversal) kaydı oluşturur."""
    orig = db.get(StockMovement, movement_id)
    if not orig or orig.tenant_id != me.tenant_id:
        raise HTTPException(404, "Stok hareketi bulunamadı.")
    if orig.is_reversed or orig.movement_type == "reversal":
        raise HTTPException(400, "Bu hareket zaten ters işlemle iptal edilmiş.")

    rev_items: list[StockMovementItem] = []
    for item in orig.items:
        prod = item.product
        if prod and prod.tracking_type == "quantity":
            if orig.movement_type in INBOUND_TYPES and orig.to_warehouse_id:
                _adjust_balance(db, me.tenant_id, prod, orig.to_warehouse_id, orig.to_location_id, -item.quantity)
            elif orig.movement_type in OUTBOUND_TYPES and orig.from_warehouse_id:
                _adjust_balance(db, me.tenant_id, prod, orig.from_warehouse_id, orig.from_location_id, item.quantity)
            elif orig.movement_type == "transfer" and orig.from_warehouse_id and orig.to_warehouse_id:
                _adjust_balance(db, me.tenant_id, prod, orig.to_warehouse_id, orig.to_location_id, -item.quantity)
                _adjust_balance(db, me.tenant_id, prod, orig.from_warehouse_id, orig.from_location_id, item.quantity)
        if item.asset and orig.from_warehouse:
            item.asset.warehouse_name = orig.from_warehouse.name
            item.asset.status = "in_warehouse"
        rev_items.append(
            StockMovementItem(
                product_id=item.product_id,
                asset_id=item.asset_id,
                quantity=item.quantity,
                previous_location_text=item.new_location_text,
                new_location_text=item.previous_location_text,
            )
        )

    orig.is_reversed = True
    rev = StockMovement(
        tenant_id=me.tenant_id,
        movement_no=_next_no(db, StockMovement, StockMovement.movement_no, "REV"),
        movement_type="reversal",
        from_warehouse_id=orig.to_warehouse_id,
        from_location_id=orig.to_location_id,
        to_warehouse_id=orig.from_warehouse_id,
        to_location_id=orig.from_location_id,
        performed_by=me.id,
        reverses_id=orig.id,
        note=f"[{orig.movement_no} TERS İŞLEMİ] {body.reason}",
        items=rev_items,
    )
    db.add(rev)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="movement.reverse",
        entity="stock_movement",
        entity_id=rev.id,
        old={"reverses": orig.movement_no},
        new={"reason": body.reason},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(rev)
    return _to_movement_out(rev)


@router.delete("/movements/bulk-delete")
def bulk_delete_movements(
    request: Request,
    movement_ids: list[uuid.UUID] | None = None,
    all_clear: bool = False,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("movement.approve")),
):
    """
    Belirli veya tüm stok hareketlerini toplu siler.
    İlişkili transfer ve bağ kayıtlarını temizler.
    """
    q = select(StockMovement).where(StockMovement.tenant_id == me.tenant_id)
    if not all_clear and movement_ids:
        q = q.where(StockMovement.id.in_(movement_ids))
    elif not all_clear and not movement_ids:
        raise HTTPException(400, "Silinecek hareketler belirtilmedi.")

    movs = db.scalars(q).all()
    count = 0
    for mov in movs:
        for trf in db.scalars(select(Transfer).where(Transfer.movement_id == mov.id)):
            trf.movement_id = None
        for rev in db.scalars(select(StockMovement).where(StockMovement.reverses_id == mov.id)):
            rev.reverses_id = None
        db.delete(mov)
        count += 1

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="movement.bulk_delete",
        entity="stock_movement",
        entity_id=None,
        new={"deleted_count": count},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True, "deleted_count": count}


@router.delete("/movements/{movement_id}")
def delete_movement(
    movement_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("movement.approve")),
):
    """Stok hareketini siler ve varsa etkilediği depo bakiyesini geri alır."""
    mov = db.get(StockMovement, movement_id)
    if not mov or mov.tenant_id != me.tenant_id:
        raise HTTPException(404, "Stok hareketi bulunamadı.")

    if not mov.is_reversed and mov.movement_type != "reversal":
        for item in mov.items:
            prod = item.product
            if prod and prod.tracking_type == "quantity":
                try:
                    if mov.movement_type in INBOUND_TYPES and mov.to_warehouse_id:
                        _adjust_balance(db, me.tenant_id, prod, mov.to_warehouse_id, mov.to_location_id, -item.quantity)
                    elif mov.movement_type in OUTBOUND_TYPES and mov.from_warehouse_id:
                        _adjust_balance(db, me.tenant_id, prod, mov.from_warehouse_id, mov.from_location_id, item.quantity)
                except HTTPException:
                    pass

    # Bu harekete bağlı transfer veya ters işlem referanslarını temizle
    for trf in db.scalars(select(Transfer).where(Transfer.movement_id == mov.id)):
        trf.movement_id = None
    for rev in db.scalars(select(StockMovement).where(StockMovement.reverses_id == mov.id)):
        rev.reverses_id = None

    mov_no = mov.movement_no
    db.delete(mov)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="movement.delete",
        entity="stock_movement",
        entity_id=movement_id,
        old={"movement_no": mov_no},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


# ==========================================
# 3. TRANSFERS (ONAYLI DEPOLAR ARASI TRANSFER)
# ==========================================
def _to_transfer_out(t: Transfer) -> TransferOut:
    return TransferOut(
        id=t.id,
        transfer_no=t.transfer_no,
        status=t.status,
        from_warehouse_id=t.from_warehouse_id,
        from_warehouse_name=t.from_warehouse.name if t.from_warehouse else "",
        from_location_name=t.from_location.name if t.from_location else None,
        to_warehouse_id=t.to_warehouse_id,
        to_warehouse_name=t.to_warehouse.name if t.to_warehouse else "",
        to_location_name=t.to_location.name if t.to_location else None,
        product_id=t.product_id,
        product_name=t.product.name if t.product else "",
        asset_id=t.asset_id,
        serial_number=t.asset.serial_number if t.asset else None,
        quantity=t.quantity,
        requested_by_name=t.requester.full_name if t.requester else "",
        approved_by_name=t.approver.full_name if t.approver else None,
        created_at=t.created_at,
        approved_at=t.approved_at,
        note=t.note,
    )


@router.get("/transfers", response_model=list[TransferOut])
def list_transfers(
    status: str | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("movement.view")),
):
    q = select(Transfer).where(Transfer.tenant_id == me.tenant_id, Transfer.is_deleted.is_(False))
    if status:
        q = q.where(Transfer.status == status)
    rows = db.scalars(q.order_by(Transfer.created_at.desc())).all()
    return [_to_transfer_out(t) for t in rows]


@router.post("/transfers", response_model=TransferOut, status_code=201)
def create_transfer_request(
    body: TransferCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("movement.create")),
):
    """Transfer talebi oluşturur. Onaylanana kadar ürün lokasyonu veya bakiye DEĞİŞMEZ."""
    if body.from_warehouse_id == body.to_warehouse_id and body.from_location_id == body.to_location_id:
        raise HTTPException(422, "Kaynak ve hedef depo/bölüm aynı olamaz.")

    prod = db.get(Product, body.product_id)
    if not prod or prod.tenant_id != me.tenant_id or prod.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")

    t = Transfer(
        tenant_id=me.tenant_id,
        transfer_no=_next_no(db, Transfer, Transfer.transfer_no, "TRF"),
        from_warehouse_id=body.from_warehouse_id,
        from_location_id=body.from_location_id,
        to_warehouse_id=body.to_warehouse_id,
        to_location_id=body.to_location_id,
        product_id=body.product_id,
        asset_id=body.asset_id,
        quantity=Decimal("1") if body.asset_id else body.quantity,
        status="pending",
        requested_by=me.id,
        note=body.note,
    )
    db.add(t)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="transfer.request",
        entity="transfer",
        entity_id=t.id,
        new={"transfer_no": t.transfer_no, "status": "pending"},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(t)
    return _to_transfer_out(t)


@router.post("/transfers/{transfer_id}/approve", response_model=TransferOut)
def approve_transfer(
    transfer_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("movement.approve")),
):
    """Transferi onaylar ve ürün/cihaz lokasyonunu + stok bakiyesini günceller."""
    t = db.get(Transfer, transfer_id)
    if not t or t.tenant_id != me.tenant_id or t.is_deleted:
        raise HTTPException(404, "Transfer kaydı bulunamadı.")
    if t.status != "pending":
        raise HTTPException(400, f"Bu transfer zaten '{t.status}' durumunda.")

    prod = t.product
    if prod.tracking_type == "quantity":
        _adjust_balance(db, me.tenant_id, prod, t.from_warehouse_id, t.from_location_id, -t.quantity)
        _adjust_balance(db, me.tenant_id, prod, t.to_warehouse_id, t.to_location_id, t.quantity)

    prev_loc = f"{t.from_warehouse.name}" + (f" / {t.from_location.name}" if t.from_location else "")
    new_loc = f"{t.to_warehouse.name}" + (f" / {t.to_location.name}" if t.to_location else "")

    if t.asset:
        t.asset.warehouse_name = t.to_warehouse.name
        t.asset.shelf_section = t.to_location.name if t.to_location else None
        t.asset.status = "in_warehouse"
    else:
        prod.warehouse_name = t.to_warehouse.name
        if t.to_location:
            prod.shelf_section = t.to_location.name

    mov = StockMovement(
        tenant_id=me.tenant_id,
        movement_no=_next_no(db, StockMovement, StockMovement.movement_no, "MOV"),
        movement_type="transfer",
        from_warehouse_id=t.from_warehouse_id,
        from_location_id=t.from_location_id,
        to_warehouse_id=t.to_warehouse_id,
        to_location_id=t.to_location_id,
        performed_by=me.id,
        note=f"[{t.transfer_no} ONAYLI TRANSFER] {t.note or ''}".strip(),
        items=[
            StockMovementItem(
                product_id=t.product_id,
                asset_id=t.asset_id,
                quantity=t.quantity,
                previous_location_text=prev_loc,
                new_location_text=new_loc,
            )
        ],
    )
    db.add(mov)
    db.flush()

    t.status = "approved"
    t.approved_by = me.id
    t.approved_at = datetime.now(timezone.utc)
    t.movement_id = mov.id

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="transfer.approve",
        entity="transfer",
        entity_id=t.id,
        old={"status": "pending", "location": prev_loc},
        new={"status": "approved", "location": new_loc},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(t)
    return _to_transfer_out(t)


@router.post("/transfers/{transfer_id}/reject", response_model=TransferOut)
def reject_transfer(
    transfer_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("movement.approve")),
):
    t = db.get(Transfer, transfer_id)
    if not t or t.tenant_id != me.tenant_id or t.is_deleted:
        raise HTTPException(404, "Transfer kaydı bulunamadı.")
    if t.status != "pending":
        raise HTTPException(400, "Yalnızca bekleyen transferler reddedilebilir.")
    t.status = "rejected"
    t.approved_by = me.id
    t.approved_at = datetime.now(timezone.utc)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="transfer.reject",
        entity="transfer",
        entity_id=t.id,
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(t)
    return _to_transfer_out(t)


@router.delete("/transfers/{transfer_id}")
def delete_transfer(
    transfer_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("movement.approve")),
):
    t = db.get(Transfer, transfer_id)
    if not t or t.tenant_id != me.tenant_id or t.is_deleted:
        raise HTTPException(404, "Transfer kaydı bulunamadı.")
    t.is_deleted = True
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="transfer.delete",
        entity="transfer",
        entity_id=t.id,
        old={"transfer_no": t.transfer_no, "status": t.status},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


# ==========================================
# 4. DEPARTMENTS & EMPLOYEES (PERSONEL)
# ==========================================
@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("employee.view")),
):
    return db.scalars(
        select(Department)
        .where(Department.tenant_id == me.tenant_id, Department.is_deleted.is_(False))
        .order_by(Department.name)
    ).all()


@router.post("/departments", response_model=DepartmentOut, status_code=201)
def create_department(
    body: DepartmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("employee.manage")),
):
    d = Department(tenant_id=me.tenant_id, name=body.name.strip(), parent_id=body.parent_id)
    db.add(d)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="department.create",
        entity="department",
        entity_id=d.id,
        new={"name": d.name},
        ip=client_ip(request),
    )
    db.commit()
    return d


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("employee.view")),
):
    q = select(Employee).where(Employee.tenant_id == me.tenant_id, Employee.is_deleted.is_(False))
    if not include_inactive:
        q = q.where(Employee.is_active.is_(True))
    emps = db.scalars(q.order_by(Employee.full_name)).all()
    depts = {
        d.id: d.name
        for d in db.scalars(select(Department).where(Department.tenant_id == me.tenant_id)).all()
    }
    active_counts = dict(
        db.execute(
            select(Assignment.employee_id, func.count(AssignmentItem.id))
            .join(AssignmentItem, AssignmentItem.assignment_id == Assignment.id)
            .where(
                Assignment.tenant_id == me.tenant_id,
                AssignmentItem.is_returned.is_(False),
            )
            .group_by(Assignment.employee_id)
        ).all()
    )
    out: list[EmployeeOut] = []
    for e in emps:
        eo = EmployeeOut.model_validate(e)
        eo.department_name = depts.get(e.department_id) if e.department_id else None
        eo.active_assignment_count = active_counts.get(e.id, 0)
        out.append(eo)
    return out


@router.post("/employees", response_model=EmployeeOut, status_code=201)
def create_employee(
    body: EmployeeCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("employee.manage")),
):
    emp = Employee(
        tenant_id=me.tenant_id,
        full_name=body.full_name.strip(),
        department_id=body.department_id,
        position=body.position,
        email=body.email,
        phone=body.phone,
    )
    db.add(emp)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="employee.create",
        entity="employee",
        entity_id=emp.id,
        new={"full_name": emp.full_name, "position": emp.position},
        ip=client_ip(request),
    )
    db.commit()
    return EmployeeOut.model_validate(emp)


@router.patch("/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: uuid.UUID,
    body: EmployeeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("employee.manage")),
):
    emp = db.get(Employee, employee_id)
    if not emp or emp.tenant_id != me.tenant_id or emp.is_deleted:
        raise HTTPException(404, "Personel bulunamadı.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(emp, k, v)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="employee.update",
        entity="employee",
        entity_id=emp.id,
        new=body.model_dump(exclude_unset=True),
        ip=client_ip(request),
    )
    db.commit()
    return EmployeeOut.model_validate(emp)


@router.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("employee.manage")),
):
    emp = db.get(Employee, employee_id)
    if not emp or emp.tenant_id != me.tenant_id or emp.is_deleted:
        raise HTTPException(404, "Personel bulunamadı.")

    active_assignments = db.scalar(
        select(func.count(Assignment.id)).where(
            Assignment.tenant_id == me.tenant_id,
            Assignment.employee_id == emp.id,
            Assignment.is_deleted.is_(False),
            Assignment.status == "delivered",
        )
    ) or 0
    if active_assignments > 0:
        raise HTTPException(
            400,
            f"Bu personelin üzerinde {active_assignments} adet aktif zimmet kaydı bulunmaktadır. Önce zimmetleri iade almalısınız.",
        )

    emp.is_deleted = True
    emp.is_active = False
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="employee.delete",
        entity="employee",
        entity_id=emp.id,
        old={"full_name": emp.full_name},
        ip=client_ip(request),
    )
    db.commit()
    return {"message": "Personel başarıyla silindi."}


# ==========================================
# 5. ASSIGNMENTS (ZİMMET TESLİM & İADE)
# ==========================================
def _to_assignment_out(a: Assignment, dept_map: dict[uuid.UUID, str]) -> AssignmentOut:
    emp = a.employee
    dept_name = dept_map.get(emp.department_id) if emp and emp.department_id else None
    return AssignmentOut(
        id=a.id,
        assignment_no=a.assignment_no,
        employee_id=a.employee_id,
        employee_name=emp.full_name if emp else "",
        employee_department=dept_name,
        employee_position=emp.position if emp else None,
        delivered_by_name=a.delivered_by.full_name if a.delivered_by else "",
        delivered_at=a.delivered_at,
        expected_return_date=a.expected_return_date,
        status=a.status,
        note=a.note,
        items=[
            AssignmentItemOut(
                id=i.id,
                product_id=i.product_id,
                product_name=i.product.name if i.product else "",
                inventory_code=i.product.inventory_code if i.product else "",
                asset_id=i.asset_id,
                serial_number=i.asset.serial_number if i.asset else None,
                quantity=i.quantity,
                returned_quantity=i.returned_quantity,
                is_returned=i.is_returned,
                returned_at=i.returned_at,
            )
            for i in a.items
        ],
    )


@router.get("/assignments", response_model=list[AssignmentOut])
def list_assignments(
    employee_id: uuid.UUID | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("assignment.view")),
):
    q = select(Assignment).where(Assignment.tenant_id == me.tenant_id, Assignment.is_deleted.is_(False))
    if employee_id:
        q = q.where(Assignment.employee_id == employee_id)
    if status:
        q = q.where(Assignment.status == status)
    rows = db.scalars(q.order_by(Assignment.delivered_at.desc())).all()
    dept_map = {
        d.id: d.name
        for d in db.scalars(select(Department).where(Department.tenant_id == me.tenant_id)).all()
    }
    return [_to_assignment_out(a, dept_map) for a in rows]


@router.get("/employees/{employee_id}/assets")
def list_employee_active_items(
    employee_id: uuid.UUID,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("assignment.view")),
):
    """Personelin üzerindeki aktif zimmetli bütün ürünleri tek ekranda listeler."""
    items = db.scalars(
        select(AssignmentItem)
        .join(Assignment, Assignment.id == AssignmentItem.assignment_id)
        .where(
            Assignment.tenant_id == me.tenant_id,
            Assignment.employee_id == employee_id,
            AssignmentItem.is_returned.is_(False),
        )
    ).all()
    return [
        {
            "assignment_item_id": i.id,
            "assignment_no": i.assignment.assignment_no,
            "delivered_at": i.assignment.delivered_at,
            "product_id": i.product_id,
            "product_name": i.product.name if i.product else "",
            "inventory_code": i.product.inventory_code if i.product else "",
            "asset_id": i.asset_id,
            "serial_number": i.asset.serial_number if i.asset else None,
            "remaining_quantity": float(i.quantity - i.returned_quantity),
        }
        for i in items
    ]


@router.post("/assignments", response_model=AssignmentOut, status_code=201)
def create_assignment(
    body: AssignmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("assignment.manage")),
):
    emp = db.get(Employee, body.employee_id)
    if not emp or emp.tenant_id != me.tenant_id or emp.is_deleted or not emp.is_active:
        raise HTTPException(404, "Aktif personel bulunamadı.")

    assign_no = _next_no(db, Assignment, Assignment.assignment_no, "ZIM")
    a_items: list[AssignmentItem] = []
    m_items: list[StockMovementItem] = []

    for it in body.items:
        prod = db.get(Product, it.product_id)
        if not prod or prod.tenant_id != me.tenant_id:
            raise HTTPException(404, "Ürün bulunamadı.")
        asset: Asset | None = None
        if it.asset_id:
            asset = db.get(Asset, it.asset_id)
            if not asset or asset.tenant_id != me.tenant_id or asset.product_id != prod.id:
                raise HTTPException(404, "Seri numaralı cihaz bulunamadı.")
            if asset.status == "assigned":
                raise HTTPException(409, f"{asset.serial_number} seri numaralı cihaz zaten zimmette.")
            prev_loc = asset.warehouse_name or "Depo"
            asset.status = "assigned"
            asset.assigned_employee_name = emp.full_name
            qty = Decimal("1")
        else:
            qty = it.quantity
            prev_loc = prod.warehouse_name or "Depo"
            from_wh_id = body.from_warehouse_id
            if not from_wh_id:
                sb = db.scalar(
                    select(StockBalance).where(
                        StockBalance.tenant_id == me.tenant_id,
                        StockBalance.product_id == prod.id,
                        StockBalance.quantity > 0,
                    ).order_by(StockBalance.quantity.desc())
                )
                if sb:
                    from_wh_id = sb.warehouse_id

            if from_wh_id:
                _adjust_balance(db, me.tenant_id, prod, from_wh_id, None, -qty)
            else:
                if (prod.quantity or Decimal("0")) < qty:
                    raise HTTPException(
                        422,
                        f"'{prod.name}' için yeterli stok yok (Mevcut: {prod.quantity or 0}, İstenen: {qty}).",
                    )
                prod.quantity = (prod.quantity or Decimal("0")) - qty
            if (prod.quantity or Decimal("0")) <= Decimal("0"):
                prod.status = "assigned"

        a_items.append(AssignmentItem(product_id=prod.id, asset_id=asset.id if asset else None, quantity=qty))
        m_items.append(
            StockMovementItem(
                product_id=prod.id,
                asset_id=asset.id if asset else None,
                quantity=qty,
                previous_location_text=prev_loc,
                new_location_text=f"Zimmet: {emp.full_name}",
            )
        )

    asg = Assignment(
        tenant_id=me.tenant_id,
        assignment_no=assign_no,
        employee_id=emp.id,
        delivered_by_user_id=me.id,
        expected_return_date=body.expected_return_date,
        status="active",
        note=body.note,
        items=a_items,
    )
    db.add(asg)

    mov = StockMovement(
        tenant_id=me.tenant_id,
        movement_no=_next_no(db, StockMovement, StockMovement.movement_no, "MOV"),
        movement_type="assign",
        from_warehouse_id=body.from_warehouse_id,
        employee_id=emp.id,
        performed_by=me.id,
        note=f"[{assign_no}] {emp.full_name} zimmet teslimi",
        items=m_items,
    )
    db.add(mov)
    db.flush()

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="assignment.create",
        entity="assignment",
        entity_id=asg.id,
        new={"assignment_no": assign_no, "employee": emp.full_name, "items": len(a_items)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(asg)
    dept_map = {
        d.id: d.name
        for d in db.scalars(select(Department).where(Department.tenant_id == me.tenant_id)).all()
    }
    return _to_assignment_out(asg, dept_map)


@router.post("/assignments/{assignment_id}/return", response_model=AssignmentOut)
def return_assignment_item(
    assignment_id: uuid.UUID,
    body: AssignmentReturnIn,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("assignment.manage")),
):
    asg = db.get(Assignment, assignment_id)
    if not asg or asg.tenant_id != me.tenant_id or asg.is_deleted:
        raise HTTPException(404, "Zimmet kaydı bulunamadı.")

    item = db.get(AssignmentItem, body.assignment_item_id)
    if not item or item.assignment_id != asg.id:
        raise HTTPException(404, "Zimmet kalemi bulunamadı.")
    if item.is_returned:
        raise HTTPException(400, "Bu kalem zaten tamamen iade alınmış.")

    remaining = item.quantity - item.returned_quantity
    if body.returned_quantity > remaining:
        raise HTTPException(422, f"İade miktarı kalan zimmet miktarından ({remaining}) fazla olamaz.")

    to_wh = db.get(Warehouse, body.to_warehouse_id) if body.to_warehouse_id else None
    item.returned_quantity += body.returned_quantity
    now = datetime.now(timezone.utc)
    if item.returned_quantity >= item.quantity:
        item.is_returned = True
        item.returned_at = now

    if not to_wh:
        to_wh = db.scalar(
            select(Warehouse).where(
                Warehouse.tenant_id == me.tenant_id,
                Warehouse.is_deleted.is_(False),
                Warehouse.code == "WH-CENTRAL",
            )
        ) or db.scalar(
            select(Warehouse).where(
                Warehouse.tenant_id == me.tenant_id,
                Warehouse.is_deleted.is_(False),
            ).order_by(Warehouse.created_at.asc())
        )

    if item.asset:
        item.asset.status = "in_warehouse"
        item.asset.assigned_employee_name = None
        item.asset.is_deleted = False
        item.asset.is_active = True
        if to_wh:
            item.asset.warehouse_name = to_wh.name
        if item.asset.product and item.asset.product.is_deleted:
            item.asset.product.is_deleted = False
            item.asset.product.is_active = True
            item.asset.product.status = "in_warehouse"
    elif item.product:
        if item.product.is_deleted:
            item.product.is_deleted = False
            item.product.is_active = True
        if to_wh:
            _adjust_balance(db, me.tenant_id, item.product, to_wh.id, None, body.returned_quantity)
        else:
            item.product.quantity = (item.product.quantity or Decimal("0")) + body.returned_quantity
        if (item.product.quantity or Decimal("0")) > 0:
            item.product.status = "in_warehouse"

    db.add(
        AssignmentReturn(
            assignment_item_id=item.id,
            returned_quantity=body.returned_quantity,
            to_warehouse_id=body.to_warehouse_id,
            received_by_user_id=me.id,
            condition_on_return=body.condition_on_return,
            note=body.note,
        )
    )

    all_done = all(x.is_returned for x in asg.items)
    asg.status = "returned" if all_done else "partial_returned"

    mov = StockMovement(
        tenant_id=me.tenant_id,
        movement_no=_next_no(db, StockMovement, StockMovement.movement_no, "MOV"),
        movement_type="unassign",
        to_warehouse_id=body.to_warehouse_id,
        employee_id=asg.employee_id,
        performed_by=me.id,
        note=f"[{asg.assignment_no}] Zimmet iadesi",
        items=[
            StockMovementItem(
                product_id=item.product_id,
                asset_id=item.asset_id,
                quantity=body.returned_quantity,
                previous_location_text=f"Zimmet: {asg.employee.full_name if asg.employee else ''}",
                new_location_text=to_wh.name if to_wh else "Depo",
            )
        ],
    )
    db.add(mov)
    db.flush()

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="assignment.return",
        entity="assignment",
        entity_id=asg.id,
        new={"assignment_no": asg.assignment_no, "returned_qty": str(body.returned_quantity)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(asg)
    dept_map = {
        d.id: d.name
        for d in db.scalars(select(Department).where(Department.tenant_id == me.tenant_id)).all()
    }
    return _to_assignment_out(asg, dept_map)


@router.delete("/assignments/bulk-delete")
def bulk_delete_assignments(
    request: Request,
    assignment_ids: list[uuid.UUID] | None = None,
    all_clear: bool = False,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("assignment.manage")),
):
    """
    Seçilen veya tüm zimmet fişlerini toplu siler.
    İade edilmemiş kalemler varsa otomatik depoya iade edilir.
    """
    q = select(Assignment).where(Assignment.tenant_id == me.tenant_id, Assignment.is_deleted.is_(False))
    if not all_clear and assignment_ids:
        q = q.where(Assignment.id.in_(assignment_ids))
    elif not all_clear and not assignment_ids:
        raise HTTPException(400, "Silinecek zimmetler belirtilmedi.")

    def_wh = db.scalar(
        select(Warehouse).where(
            Warehouse.tenant_id == me.tenant_id,
            Warehouse.is_deleted.is_(False),
            Warehouse.code == "WH-CENTRAL",
        )
    ) or db.scalar(
        select(Warehouse).where(
            Warehouse.tenant_id == me.tenant_id,
            Warehouse.is_deleted.is_(False),
        ).order_by(Warehouse.created_at.asc())
    )

    asgs = db.scalars(q).all()
    count = 0
    now = datetime.now(timezone.utc)
    for asg in asgs:
        for item in asg.items:
            if not item.is_returned:
                rem = item.quantity - item.returned_quantity
                if rem > 0:
                    if item.asset:
                        item.asset.status = "in_warehouse"
                        item.asset.assigned_employee_name = None
                        if def_wh:
                            item.asset.warehouse_name = def_wh.name
                    elif item.product and def_wh:
                        _adjust_balance(db, me.tenant_id, item.product, def_wh.id, None, rem)
                        if (item.product.quantity or Decimal("0")) > 0:
                            item.product.status = "in_warehouse"
                item.is_returned = True
                item.returned_at = now
        asg.is_deleted = True
        asg.deleted_at = now
        count += 1

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="assignment.bulk_delete",
        entity="assignment",
        entity_id=None,
        new={"deleted_count": count},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True, "deleted_count": count}


@router.delete("/assignments/{assignment_id}", status_code=204)
def delete_assignment(
    assignment_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("assignment.manage")),
):
    """
    Zimmet fişini iptal eder / siler.
    Henüz iade edilmemiş aktif kalemler varsa stoklarını depoya geri iade eder.
    """
    asg = db.get(Assignment, assignment_id)
    if not asg or asg.tenant_id != me.tenant_id or asg.is_deleted:
        raise HTTPException(404, "Zimmet kaydı bulunamadı.")

    # Varsayılan depo (iade edilmemişlerin geri döneceği depo)
    def_wh = db.scalar(
        select(Warehouse).where(
            Warehouse.tenant_id == me.tenant_id,
            Warehouse.is_deleted.is_(False),
            Warehouse.code == "WH-CENTRAL",
        )
    ) or db.scalar(
        select(Warehouse).where(
            Warehouse.tenant_id == me.tenant_id,
            Warehouse.is_deleted.is_(False),
        ).order_by(Warehouse.created_at.asc())
    )

    for item in asg.items:
        if not item.is_returned:
            rem = item.quantity - item.returned_quantity
            if rem > 0:
                if item.asset:
                    item.asset.status = "in_warehouse"
                    item.asset.assigned_employee_name = None
                    if def_wh:
                        item.asset.warehouse_name = def_wh.name
                elif item.product and def_wh:
                    _adjust_balance(db, me.tenant_id, item.product, def_wh.id, None, rem)
                    if (item.product.quantity or Decimal("0")) > 0 and item.product.status == "assigned":
                        item.product.status = "in_warehouse"
            item.is_returned = True
            item.returned_at = datetime.now(timezone.utc)

    asg.is_deleted = True
    asg.deleted_at = datetime.now(timezone.utc)

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="assignment.delete",
        entity="assignment",
        entity_id=asg.id,
        new={"assignment_no": asg.assignment_no, "status": "deleted"},
        ip=client_ip(request),
    )
    db.commit()
    return None


@router.delete("/assignments/{assignment_id}/items/{item_id}", status_code=204)
def delete_assignment_item(
    assignment_id: uuid.UUID,
    item_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("assignment.manage")),
):
    """
    Zimmet fişindeki belirli bir kalemi siler.
    Eğer henüz iade edilmemişse kalan miktar otomatik olarak depoya geri iade edilir.
    """
    asg = db.get(Assignment, assignment_id)
    if not asg or asg.tenant_id != me.tenant_id or asg.is_deleted:
        raise HTTPException(404, "Zimmet kaydı bulunamadı.")

    item = db.get(AssignmentItem, item_id)
    if not item or item.assignment_id != asg.id:
        raise HTTPException(404, "Zimmet kalemi bulunamadı.")

    rem = item.quantity - item.returned_quantity
    if rem > 0 and not item.is_returned:
        def_wh = db.scalar(
            select(Warehouse).where(
                Warehouse.tenant_id == me.tenant_id,
                Warehouse.is_deleted.is_(False),
                Warehouse.code == "WH-CENTRAL",
            )
        ) or db.scalar(
            select(Warehouse).where(
                Warehouse.tenant_id == me.tenant_id,
                Warehouse.is_deleted.is_(False),
            ).order_by(Warehouse.created_at.asc())
        )

        if item.asset:
            item.asset.status = "in_warehouse"
            item.asset.assigned_employee_name = None
            item.asset.is_deleted = False
            item.asset.is_active = True
            if def_wh:
                item.asset.warehouse_name = def_wh.name
            if item.asset.product and item.asset.product.is_deleted:
                item.asset.product.is_deleted = False
                item.asset.product.is_active = True
                item.asset.product.status = "in_warehouse"
        elif item.product:
            if item.product.is_deleted:
                item.product.is_deleted = False
                item.product.is_active = True
            if def_wh:
                _adjust_balance(db, me.tenant_id, item.product, def_wh.id, None, rem)
            else:
                item.product.quantity = (item.product.quantity or Decimal("0")) + rem
            if (item.product.quantity or Decimal("0")) > 0:
                item.product.status = "in_warehouse"

    prod_name = item.product.name if item.product else ""
    db.delete(item)
    db.flush()

    # Eğer fişte hiç kalem kalmadıysa fişi de soft delete yap
    remaining_items = [it for it in asg.items if it.id != item.id]
    if not remaining_items:
        asg.is_deleted = True
        asg.deleted_at = datetime.now(timezone.utc)
    else:
        all_done = all(it.is_returned for it in remaining_items)
        asg.status = "returned" if all_done else "active"

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="assignment.delete_item",
        entity="assignment",
        entity_id=asg.id,
        new={"assignment_no": asg.assignment_no, "deleted_item": prod_name, "returned_qty": str(rem)},
        ip=client_ip(request),
    )
    db.commit()
    return None
