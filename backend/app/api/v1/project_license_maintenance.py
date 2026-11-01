import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.warehouse_assignment import _adjust_balance, _next_no
from app.core.deps import client_ip, require_permission, write_audit
from app.core.security import decrypt_secret, encrypt_secret, mask_license_key
from app.db.session import get_db
from app.models.core import Employee, User
from app.models.inventory import Asset, Product
from app.models.project_license_maintenance import (
    LicenseAssignment,
    LicenseRenewal,
    MaintenanceRecord,
    Project,
    ProjectAsset,
    ProjectMovement,
    ServiceRecord,
    SoftwareLicense,
    SoftwareProduct,
)
from app.models.warehouse_assignment import StockBalance, StockMovement, StockMovementItem, Warehouse
from app.schemas.project_license_maintenance import (
    LicenseCreate,
    LicenseOut,
    LicenseRenewalIn,
    MaintenanceCreate,
    MaintenanceOut,
    ProjectAssetOut,
    ProjectCreate,
    ProjectEquipmentReturnIn,
    ProjectEquipmentSendIn,
    ProjectOut,
    ProjectUpdate,
    ServiceCreate,
    ServiceOut,
    ServiceUpdate,
)

router = APIRouter(tags=["projects, licenses & maintenance"])


# ==========================================
# 1. PROJECTS (PROJE VE PROJE EKİPMAN YÖNETİMİ)
# ==========================================
def _to_project_out(p: Project) -> ProjectOut:
    cost_by_curr: dict[str, Decimal] = {"TRY": Decimal("0"), "EUR": Decimal("0"), "USD": Decimal("0")}
    mkt_by_curr: dict[str, Decimal] = {"TRY": Decimal("0"), "EUR": Decimal("0"), "USD": Decimal("0")}

    equip_out: list[ProjectAssetOut] = []
    still_cnt = 0
    ret_cnt = 0

    for pa in p.project_assets:
        prod = pa.product
        asset = pa.asset
        rem = pa.quantity - pa.returned_quantity
        if rem > 0:
            still_cnt += 1
        else:
            ret_cnt += 1

        unit_cost = (
            asset.purchase_price
            if asset and asset.purchase_price is not None
            else (prod.purchase_price if prod and prod.purchase_price is not None else Decimal("0"))
        )
        cost_curr = (
            asset.purchase_currency
            if asset and asset.purchase_currency
            else (prod.purchase_currency if prod else "TRY")
        )
        unit_mkt = (
            asset.current_market_value
            if asset and asset.current_market_value is not None
            else (prod.current_market_value if prod and prod.current_market_value is not None else Decimal("0"))
        )
        mkt_curr = (
            asset.market_value_currency
            if asset and asset.market_value_currency
            else (prod.market_value_currency if prod else "TRY")
        )

        # Projede aktif bulunan veya projeye gönderilen ekipmanların toplam değeri
        active_qty = rem if rem > 0 else pa.quantity
        c_total = unit_cost * active_qty
        m_total = unit_mkt * active_qty

        if rem > 0:
            cost_by_curr[cost_curr] = cost_by_curr.get(cost_curr, Decimal("0")) + c_total
            mkt_by_curr[mkt_curr] = mkt_by_curr.get(mkt_curr, Decimal("0")) + m_total

        equip_out.append(
            ProjectAssetOut(
                id=pa.id,
                product_id=pa.product_id,
                product_name=prod.name if prod else "",
                inventory_code=asset.inventory_code if asset else (prod.inventory_code if prod else ""),
                unit=prod.unit if prod else "Adet",
                asset_id=pa.asset_id,
                serial_number=asset.serial_number if asset else None,
                quantity=pa.quantity,
                returned_quantity=pa.returned_quantity,
                remaining_in_project=rem,
                status=pa.status,
                purchase_cost_total=c_total,
                purchase_currency=cost_curr,
                market_value_total=m_total,
                market_value_currency=mkt_curr,
                sent_at=pa.sent_at,
                returned_at=pa.returned_at,
                note=pa.note,
            )
        )

    mgr_name = p.manager_name or (p.manager.full_name if p.manager else None)
    return ProjectOut(
        id=p.id,
        code=p.code,
        name=p.name,
        customer=p.customer,
        start_date=p.start_date,
        end_date=p.end_date,
        manager_employee_id=p.manager_employee_id,
        manager_name=mgr_name,
        address=p.address,
        status=p.status,
        description=p.description,
        total_sent_items=len(p.project_assets),
        still_in_project_items=still_cnt,
        returned_items=ret_cnt,
        purchase_cost_by_currency={k: float(v) for k, v in cost_by_curr.items() if v > 0},
        market_value_by_currency={k: float(v) for k, v in mkt_by_curr.items() if v > 0},
        equipment=equip_out,
    )


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(
    status: str | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("project.view")),
):
    q = select(Project).where(Project.tenant_id == me.tenant_id, Project.is_deleted.is_(False))
    if status:
        q = q.where(Project.status == status)
    rows = db.scalars(q.order_by(Project.created_at.desc())).all()
    return [_to_project_out(p) for p in rows]


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(
    body: ProjectCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("project.manage")),
):
    code = body.code.strip().upper()
    if db.scalar(select(Project).where(Project.tenant_id == me.tenant_id, Project.code == code)):
        raise HTTPException(409, "Bu proje kodu zaten kullanımda.")

    mgr_name = body.manager_name
    if body.manager_employee_id and not mgr_name:
        emp = db.get(Employee, body.manager_employee_id)
        if emp:
            mgr_name = emp.full_name

    p = Project(
        tenant_id=me.tenant_id,
        code=code,
        name=body.name.strip(),
        customer=body.customer,
        start_date=body.start_date,
        end_date=body.end_date,
        manager_employee_id=body.manager_employee_id,
        manager_name=mgr_name,
        address=body.address,
        status=body.status,
        description=body.description,
    )
    db.add(p)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="project.create",
        entity="project",
        entity_id=p.id,
        new={"code": p.code, "name": p.name, "customer": p.customer},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(p)
    return _to_project_out(p)


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("project.manage")),
):
    p = db.get(Project, project_id)
    if not p or p.tenant_id != me.tenant_id or p.is_deleted:
        raise HTTPException(404, "Proje bulunamadı.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="project.update",
        entity="project",
        entity_id=p.id,
        new=body.model_dump(exclude_unset=True),
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(p)
    return _to_project_out(p)


@router.post("/projects/{project_id}/send", response_model=ProjectOut)
def send_equipment_to_project(
    project_id: uuid.UUID,
    body: ProjectEquipmentSendIn,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("project.manage")),
):
    proj = db.get(Project, project_id)
    if not proj or proj.tenant_id != me.tenant_id or proj.is_deleted:
        raise HTTPException(404, "Proje bulunamadı.")

    mov_items: list[StockMovementItem] = []
    for it in body.items:
        prod = db.get(Product, it.product_id)
        if not prod or prod.tenant_id != me.tenant_id:
            raise HTTPException(404, "Ürün bulunamadı.")
        asset: Asset | None = None
        if it.asset_id:
            asset = db.get(Asset, it.asset_id)
            if not asset or asset.tenant_id != me.tenant_id or asset.product_id != prod.id:
                raise HTTPException(404, "Seri numaralı cihaz bulunamadı.")
            if asset.status == "in_project":
                raise HTTPException(409, f"{asset.serial_number} seri numaralı cihaz zaten bir projede.")
            prev_loc = asset.warehouse_name or "Depo"
            asset.status = "in_project"
            asset.assigned_project_name = proj.name
            qty = Decimal("1")
        else:
            qty = it.quantity
            prev_loc = prod.warehouse_name or "Depo"
            from_wh_id = body.from_warehouse_id
            if not from_wh_id:
                # Depo belirtilmediyse bakiyesi olan depodan otomatik düş
                from app.models.warehouse_assignment import StockBalance
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
            # Her zaman ürün toplam miktarını güncel depolardaki toplam stok ile senkronize et
            total_stock = db.scalar(
                select(func.coalesce(func.sum(StockBalance.quantity), 0)).where(
                    StockBalance.tenant_id == me.tenant_id,
                    StockBalance.product_id == prod.id,
                )
            )
            if total_stock is not None and from_wh_id:
                prod.quantity = Decimal(str(total_stock))
            if (prod.quantity or Decimal("0")) <= Decimal("0"):
                prod.status = "in_project"

        db.add(
            ProjectAsset(
                tenant_id=me.tenant_id,
                project_id=proj.id,
                product_id=prod.id,
                asset_id=asset.id if asset else None,
                quantity=qty,
                status="in_project",
                note=it.note or body.note,
            )
        )
        mov_items.append(
            StockMovementItem(
                product_id=prod.id,
                asset_id=asset.id if asset else None,
                quantity=qty,
                previous_location_text=prev_loc,
                new_location_text=f"Proje: {proj.name}",
            )
        )

    mov = StockMovement(
        tenant_id=me.tenant_id,
        movement_no=_next_no(db, StockMovement, StockMovement.movement_no, "MOV"),
        movement_type="to_project",
        from_warehouse_id=body.from_warehouse_id,
        project_name=proj.name,
        performed_by=me.id,
        note=f"[{proj.code}] {proj.name} projesine ekipman gönderimi",
        items=mov_items,
    )
    db.add(mov)
    db.flush()
    db.add(ProjectMovement(project_id=proj.id, movement_id=mov.id))

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="project.send_equipment",
        entity="project",
        entity_id=proj.id,
        new={"project": proj.name, "items": len(mov_items)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(proj)
    return _to_project_out(proj)


@router.post("/projects/{project_id}/return", response_model=ProjectOut)
def return_equipment_from_project(
    project_id: uuid.UUID,
    body: ProjectEquipmentReturnIn,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("project.manage")),
):
    proj = db.get(Project, project_id)
    if not proj or proj.tenant_id != me.tenant_id or proj.is_deleted:
        raise HTTPException(404, "Proje bulunamadı.")

    pa = db.get(ProjectAsset, body.project_asset_id)
    if not pa or pa.project_id != proj.id:
        raise HTTPException(404, "Proje ekipman kaydı bulunamadı.")

    rem = pa.quantity - pa.returned_quantity
    if body.returned_quantity > rem:
        raise HTTPException(422, f"İade adedi projede kalan miktardan ({rem}) fazla olamaz.")

    to_wh = db.get(Warehouse, body.to_warehouse_id) if body.to_warehouse_id else None
    if not to_wh:
        # İade için depo belirtilmediyse varsayılan Merkez Depo'yu seç
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

    pa.returned_quantity += body.returned_quantity
    if pa.returned_quantity >= pa.quantity:
        pa.status = "returned"
        pa.returned_at = datetime.now(timezone.utc)
    else:
        pa.status = "partial_returned"

    if pa.asset:
        pa.asset.status = "in_warehouse"
        pa.asset.assigned_project_name = None
        if to_wh:
            pa.asset.warehouse_name = to_wh.name
    elif pa.product:
        if to_wh:
            _adjust_balance(db, me.tenant_id, pa.product, to_wh.id, None, body.returned_quantity)
        else:
            pa.product.quantity = (pa.product.quantity or Decimal("0")) + body.returned_quantity
        total_stock = db.scalar(
            select(func.coalesce(func.sum(StockBalance.quantity), 0)).where(
                StockBalance.tenant_id == me.tenant_id,
                StockBalance.product_id == pa.product.id,
            )
        )
        if total_stock is not None and to_wh:
            pa.product.quantity = Decimal(str(total_stock))
        if pa.product.quantity > Decimal("0") and pa.product.status == "in_project":
            pa.product.status = "in_warehouse"

    mov = StockMovement(
        tenant_id=me.tenant_id,
        movement_no=_next_no(db, StockMovement, StockMovement.movement_no, "MOV"),
        movement_type="from_project",
        to_warehouse_id=body.to_warehouse_id,
        project_name=proj.name,
        performed_by=me.id,
        note=f"[{proj.code}] {proj.name} projesinden ekipman dönüşü",
        items=[
            StockMovementItem(
                product_id=pa.product_id,
                asset_id=pa.asset_id,
                quantity=body.returned_quantity,
                previous_location_text=f"Proje: {proj.name}",
                new_location_text=to_wh.name if to_wh else "Depo",
            )
        ],
    )
    db.add(mov)
    db.flush()
    db.add(ProjectMovement(project_id=proj.id, movement_id=mov.id))

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="project.return_equipment",
        entity="project",
        entity_id=proj.id,
        new={"project": proj.name, "returned_qty": str(body.returned_quantity)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(proj)
    return _to_project_out(proj)


# ==========================================
# 2. SOFTWARE LICENSES (ŞİFRELİ YAZILIM LİSANSLARI)
# ==========================================
def _to_license_out(lic: SoftwareLicense) -> LicenseOut:
    lo = LicenseOut.model_validate(lic)
    lo.assigned_asset_name = (
        f"{lic.assigned_asset.product.name} ({lic.assigned_asset.serial_number})"
        if lic.assigned_asset and lic.assigned_asset.product
        else None
    )
    lo.assigned_employee_name = lic.assigned_employee.full_name if lic.assigned_employee else None
    lo.supplier_name = lic.supplier.name if lic.supplier else None

    if lic.end_date:
        delta = (lic.end_date - date.today()).days
        lo.days_remaining = delta
        if delta < 0:
            lo.expiry_alert_level = "expired"
        elif delta <= 7:
            lo.expiry_alert_level = "7_days"
        elif delta <= 15:
            lo.expiry_alert_level = "15_days"
        elif delta <= 30:
            lo.expiry_alert_level = "30_days"
        else:
            lo.expiry_alert_level = "ok"
    return lo


@router.get("/licenses", response_model=list[LicenseOut])
def list_licenses(
    expiring_within_days: int | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("license.view")),
):
    rows = db.scalars(
        select(SoftwareLicense)
        .where(SoftwareLicense.tenant_id == me.tenant_id, SoftwareLicense.is_deleted.is_(False))
        .order_by(SoftwareLicense.end_date.asc().nulls_last(), SoftwareLicense.software_name)
    ).all()
    out = [_to_license_out(r) for r in rows]
    if expiring_within_days is not None:
        out = [x for x in out if x.days_remaining is not None and x.days_remaining <= expiring_within_days]
    return out


@router.post("/licenses", response_model=LicenseOut, status_code=201)
def create_license(
    body: LicenseCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("license.manage")),
):
    sw_prod = db.scalar(
        select(SoftwareProduct).where(
            SoftwareProduct.tenant_id == me.tenant_id,
            func.lower(SoftwareProduct.name) == body.software_name.strip().lower(),
            func.coalesce(SoftwareProduct.version, "") == (body.version or ""),
        )
    )
    if not sw_prod:
        sw_prod = SoftwareProduct(
            tenant_id=me.tenant_id,
            name=body.software_name.strip(),
            vendor=body.vendor.strip(),
            version=body.version,
        )
        db.add(sw_prod)
        db.flush()

    lic = SoftwareLicense(
        tenant_id=me.tenant_id,
        software_product_id=sw_prod.id,
        software_name=body.software_name.strip(),
        vendor=body.vendor.strip(),
        version=body.version,
        license_type=body.license_type,
        key_encrypted=encrypt_secret(body.license_key),
        key_masked=mask_license_key(body.license_key),
        license_no=body.license_no,
        purchase_date=body.purchase_date,
        start_date=body.start_date,
        end_date=body.end_date,
        seats_total=body.seats_total,
        seats_used=body.seats_used,
        assigned_asset_id=body.assigned_asset_id,
        assigned_employee_id=body.assigned_employee_id,
        assigned_project_id=body.assigned_project_id,
        cost=body.cost,
        currency=body.currency,
        supplier_id=body.supplier_id,
        invoice_no=body.invoice_no,
        contract_no=body.contract_no,
        notes=body.notes,
    )
    db.add(lic)
    db.flush()

    if body.assigned_asset_id or body.assigned_employee_id:
        db.add(
            LicenseAssignment(
                license_id=lic.id,
                asset_id=body.assigned_asset_id,
                employee_id=body.assigned_employee_id,
            )
        )

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="license.create",
        entity="software_license",
        entity_id=lic.id,
        new={"software_name": lic.software_name, "type": lic.license_type, "end_date": str(lic.end_date)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(lic)
    return _to_license_out(lic)


@router.get("/licenses/{license_id}/key")
def reveal_license_key(
    license_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("license.view_key")),
):
    """Şifreli lisans anahtarını yalnızca 'license.view_key' yetkisi olan kullanıcıya çözer ve audit log yazar."""
    lic = db.get(SoftwareLicense, license_id)
    if not lic or lic.tenant_id != me.tenant_id or lic.is_deleted:
        raise HTTPException(404, "Lisans bulunamadı.")
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="license.view_secret_key",
        entity="software_license",
        entity_id=lic.id,
        new={"software_name": lic.software_name},
        ip=client_ip(request),
    )
    db.commit()
    return {"id": lic.id, "license_key": decrypt_secret(lic.key_encrypted)}


@router.post("/licenses/{license_id}/renew", response_model=LicenseOut)
def renew_license(
    license_id: uuid.UUID,
    body: LicenseRenewalIn,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("license.manage")),
):
    lic = db.get(SoftwareLicense, license_id)
    if not lic or lic.tenant_id != me.tenant_id or lic.is_deleted:
        raise HTTPException(404, "Lisans bulunamadı.")

    prev_end = lic.end_date
    lic.end_date = body.new_end_date
    lic.status = "active"

    db.add(
        LicenseRenewal(
            license_id=lic.id,
            renewed_at=date.today(),
            previous_end_date=prev_end,
            new_end_date=body.new_end_date,
            cost=body.cost,
            currency=body.currency,
            invoice_no=body.invoice_no,
            note=body.note,
        )
    )
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="license.renew",
        entity="software_license",
        entity_id=lic.id,
        old={"end_date": str(prev_end)},
        new={"end_date": str(body.new_end_date), "cost": str(body.cost)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(lic)
    return _to_license_out(lic)


# ==========================================
# 3. MAINTENANCE & SERVICE MODULE (BAKIM VE SERVİS)
# ==========================================
def _to_service_out(sr: ServiceRecord) -> ServiceOut:
    return ServiceOut(
        id=sr.id,
        service_no=sr.service_no,
        product_id=sr.product_id,
        product_name=sr.product.name if sr.product else "",
        inventory_code=sr.asset.inventory_code if sr.asset else (sr.product.inventory_code if sr.product else ""),
        asset_id=sr.asset_id,
        serial_number=sr.asset.serial_number if sr.asset else None,
        fault_type=sr.fault_type,
        fault_description=sr.fault_description,
        service_company=sr.service_company,
        sent_date=sr.sent_date,
        return_date=sr.return_date,
        labor_cost=sr.labor_cost,
        parts_cost=sr.parts_cost,
        total_cost=sr.total_cost,
        currency=sr.currency,
        warranty_covered=sr.warranty_covered,
        service_report=sr.service_report,
        result=sr.result,
        created_at=sr.created_at,
    )


@router.get("/service-records", response_model=list[ServiceOut])
def list_service_records(
    result: str | None = None,
    asset_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("maintenance.view")),
):
    q = select(ServiceRecord).where(ServiceRecord.tenant_id == me.tenant_id, ServiceRecord.is_deleted.is_(False))
    if result:
        q = q.where(ServiceRecord.result == result)
    if asset_id:
        q = q.where(ServiceRecord.asset_id == asset_id)
    rows = db.scalars(q.order_by(ServiceRecord.sent_date.desc())).all()
    return [_to_service_out(r) for r in rows]


@router.post("/service-records", response_model=ServiceOut, status_code=201)
def create_service_record(
    body: ServiceCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("maintenance.manage")),
):
    prod = db.get(Product, body.product_id)
    if not prod or prod.tenant_id != me.tenant_id:
        raise HTTPException(404, "Ürün bulunamadı.")

    asset = db.get(Asset, body.asset_id) if body.asset_id else None
    if asset:
        if body.result == "in_service":
            asset.status = "in_service"
        elif body.result in {"repaired", "replaced"}:
            asset.status = "in_warehouse"
        elif body.result == "unrepairable":
            asset.status = "scrapped"

    total = Decimal("0") if body.warranty_covered else (body.labor_cost + body.parts_cost)
    sr = ServiceRecord(
        tenant_id=me.tenant_id,
        service_no=_next_no(db, ServiceRecord, ServiceRecord.service_no, "SRV"),
        product_id=prod.id,
        asset_id=asset.id if asset else None,
        fault_type=body.fault_type,
        fault_description=body.fault_description,
        service_company=body.service_company,
        sent_date=body.sent_date,
        return_date=body.return_date,
        labor_cost=body.labor_cost,
        parts_cost=body.parts_cost,
        total_cost=total,
        currency=body.currency,
        warranty_covered=body.warranty_covered,
        service_report=body.service_report,
        result=body.result,
        performed_by_user_id=me.id,
    )
    db.add(sr)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="service.create",
        entity="service_record",
        entity_id=sr.id,
        new={"service_no": sr.service_no, "fault_type": sr.fault_type, "total_cost": str(sr.total_cost)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(sr)
    return _to_service_out(sr)


@router.patch("/service-records/{service_id}", response_model=ServiceOut)
def update_service_record(
    service_id: uuid.UUID,
    body: ServiceUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("maintenance.manage")),
):
    sr = db.get(ServiceRecord, service_id)
    if not sr or sr.tenant_id != me.tenant_id or sr.is_deleted:
        raise HTTPException(404, "Servis kaydı bulunamadı.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(sr, k, v)
    sr.total_cost = Decimal("0") if sr.warranty_covered else (sr.labor_cost + sr.parts_cost)

    if sr.asset and body.result:
        if body.result in {"repaired", "replaced"}:
            sr.asset.status = "in_warehouse"
        elif body.result == "unrepairable":
            sr.asset.status = "scrapped"

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="service.update",
        entity="service_record",
        entity_id=sr.id,
        new={"result": sr.result, "total_cost": str(sr.total_cost)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(sr)
    return _to_service_out(sr)


@router.get("/maintenance-records", response_model=list[MaintenanceOut])
def list_maintenance_records(
    asset_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("maintenance.view")),
):
    q = select(MaintenanceRecord).where(
        MaintenanceRecord.tenant_id == me.tenant_id, MaintenanceRecord.is_deleted.is_(False)
    )
    if asset_id:
        q = q.where(MaintenanceRecord.asset_id == asset_id)
    rows = db.scalars(q.order_by(MaintenanceRecord.performed_date.desc())).all()
    return [
        MaintenanceOut(
            id=r.id,
            product_id=r.product_id,
            product_name=r.product.name if r.product else "",
            asset_id=r.asset_id,
            serial_number=r.asset.serial_number if r.asset else None,
            maintenance_type=r.maintenance_type,
            description=r.description,
            performed_date=r.performed_date,
            next_maintenance_date=r.next_maintenance_date,
            cost=r.cost,
            currency=r.currency,
            technician_name=r.technician_name,
        )
        for r in rows
    ]


@router.post("/maintenance-records", response_model=MaintenanceOut, status_code=201)
def create_maintenance_record(
    body: MaintenanceCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("maintenance.manage")),
):
    r = MaintenanceRecord(
        tenant_id=me.tenant_id,
        product_id=body.product_id,
        asset_id=body.asset_id,
        maintenance_type=body.maintenance_type,
        description=body.description,
        performed_date=body.performed_date,
        next_maintenance_date=body.next_maintenance_date,
        cost=body.cost,
        currency=body.currency,
        technician_name=body.technician_name,
    )
    db.add(r)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="maintenance.create",
        entity="maintenance_record",
        entity_id=r.id,
        new={"type": r.maintenance_type, "cost": str(r.cost)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(r)
    return MaintenanceOut(
        id=r.id,
        product_id=r.product_id,
        product_name=r.product.name if r.product else "",
        asset_id=r.asset_id,
        serial_number=r.asset.serial_number if r.asset else None,
        maintenance_type=r.maintenance_type,
        description=r.description,
        performed_date=r.performed_date,
        next_maintenance_date=r.next_maintenance_date,
        cost=r.cost,
        currency=r.currency,
        technician_name=r.technician_name,
    )


@router.get("/assets/{asset_id}/maintenance-cost")
def get_asset_total_maintenance_cost(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("maintenance.view")),
):
    """Cihazın tüm servis ve periyodik bakım maliyetlerinin para birimi bazlı toplamını hesaplar."""
    srv_rows = db.scalars(
        select(ServiceRecord).where(
            ServiceRecord.tenant_id == me.tenant_id,
            ServiceRecord.asset_id == asset_id,
            ServiceRecord.is_deleted.is_(False),
        )
    ).all()
    mnt_rows = db.scalars(
        select(MaintenanceRecord).where(
            MaintenanceRecord.tenant_id == me.tenant_id,
            MaintenanceRecord.asset_id == asset_id,
            MaintenanceRecord.is_deleted.is_(False),
        )
    ).all()

    totals: dict[str, Decimal] = {"TRY": Decimal("0"), "EUR": Decimal("0"), "USD": Decimal("0")}
    for s in srv_rows:
        totals[s.currency] = totals.get(s.currency, Decimal("0")) + s.total_cost
    for m in mnt_rows:
        totals[m.currency] = totals.get(m.currency, Decimal("0")) + m.cost

    return {
        "asset_id": asset_id,
        "service_count": len(srv_rows),
        "maintenance_count": len(mnt_rows),
        "total_cost_by_currency": {k: float(v) for k, v in totals.items()},
    }
