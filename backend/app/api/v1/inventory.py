import secrets
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_permission, write_audit
from app.db.session import get_db
from app.models.core import User
from app.models.inventory import (
    Asset,
    Brand,
    Category,
    Product,
    ProductAttribute,
    ProductModel,
    Supplier,
)
from app.schemas.inventory import (
    AssetBulkCreate,
    AssetCreate,
    AssetOut,
    AssetUpdate,
    AttributeItem,
    BrandCreate,
    BrandOut,
    BrandUpdate,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    ModelCreate,
    ModelOut,
    ModelUpdate,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    SupplierCreate,
    SupplierOut,
    SupplierUpdate,
)

router = APIRouter(tags=["inventory"])


# ==========================================
# 1. CATEGORIES
# ==========================================
@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.view")),
):
    q = select(Category).where(Category.tenant_id == me.tenant_id, Category.is_deleted.is_(False))
    if not include_inactive:
        q = q.where(Category.is_active.is_(True))
    cats = db.scalars(q.order_by(Category.name)).all()

    counts = dict(
        db.execute(
            select(Product.category_id, func.count(Product.id))
            .where(Product.tenant_id == me.tenant_id, Product.is_deleted.is_(False))
            .group_by(Product.category_id)
        ).all()
    )
    out: list[CategoryOut] = []
    for c in cats:
        item = CategoryOut.model_validate(c)
        item.product_count = counts.get(c.id, 0)
        out.append(item)
    return out


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    body: CategoryCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("category.manage")),
):
    code = body.code.upper()
    if db.scalar(select(Category).where(Category.tenant_id == me.tenant_id, Category.code == code)):
        raise HTTPException(409, "Bu kategori kodu zaten kullanımda.")
    cat = Category(
        tenant_id=me.tenant_id,
        name=body.name.strip(),
        code=code,
        parent_id=body.parent_id,
        tracking_type=body.tracking_type,
        icon=body.icon,
        description=body.description,
    )
    db.add(cat)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="category.create",
        entity="category",
        entity_id=cat.id,
        new={"code": cat.code, "name": cat.name, "tracking_type": cat.tracking_type},
        ip=client_ip(request),
    )
    db.commit()
    return CategoryOut.model_validate(cat)


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("category.manage")),
):
    cat = db.get(Category, category_id)
    if not cat or cat.tenant_id != me.tenant_id or cat.is_deleted:
        raise HTTPException(404, "Kategori bulunamadı.")
    old = {"name": cat.name, "tracking_type": cat.tracking_type, "is_active": cat.is_active}
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="category.update",
        entity="category",
        entity_id=cat.id,
        old=old,
        new=body.model_dump(exclude_unset=True),
        ip=client_ip(request),
    )
    db.commit()
    return CategoryOut.model_validate(cat)


# ==========================================
# 2. BRANDS & MODELS
# ==========================================
@router.get("/brands", response_model=list[BrandOut])
def list_brands(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.view")),
):
    brands = db.scalars(
        select(Brand).where(Brand.tenant_id == me.tenant_id, Brand.is_deleted.is_(False)).order_by(Brand.name)
    ).all()
    counts = dict(
        db.execute(
            select(ProductModel.brand_id, func.count(ProductModel.id))
            .where(ProductModel.tenant_id == me.tenant_id, ProductModel.is_deleted.is_(False))
            .group_by(ProductModel.brand_id)
        ).all()
    )
    res: list[BrandOut] = []
    for b in brands:
        bo = BrandOut.model_validate(b)
        bo.model_count = counts.get(b.id, 0)
        res.append(bo)
    return res


@router.post("/brands", response_model=BrandOut, status_code=201)
def create_brand(
    body: BrandCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("brand.manage")),
):
    name = body.name.strip()
    if db.scalar(select(Brand).where(Brand.tenant_id == me.tenant_id, func.lower(Brand.name) == name.lower())):
        raise HTTPException(409, "Bu marka zaten kayıtlı.")
    b = Brand(
        tenant_id=me.tenant_id,
        name=name,
        country=body.country,
        website=body.website,
        description=body.description,
    )
    db.add(b)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="brand.create",
        entity="brand",
        entity_id=b.id,
        new={"name": b.name},
        ip=client_ip(request),
    )
    db.commit()
    return BrandOut.model_validate(b)


@router.patch("/brands/{brand_id}", response_model=BrandOut)
def update_brand(
    brand_id: uuid.UUID,
    body: BrandUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("brand.manage")),
):
    b = db.get(Brand, brand_id)
    if not b or b.tenant_id != me.tenant_id or b.is_deleted:
        raise HTTPException(404, "Marka bulunamadı.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="brand.update",
        entity="brand",
        entity_id=b.id,
        new=body.model_dump(exclude_unset=True),
        ip=client_ip(request),
    )
    db.commit()
    return BrandOut.model_validate(b)


@router.delete("/brands/{brand_id}")
def delete_brand(
    brand_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("brand.manage")),
):
    b = db.get(Brand, brand_id)
    if not b or b.tenant_id != me.tenant_id or b.is_deleted:
        raise HTTPException(404, "Marka bulunamadı.")
    b.is_deleted = True
    b.is_active = False
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="brand.delete",
        entity="brand",
        entity_id=b.id,
        old={"name": b.name},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


@router.get("/models", response_model=list[ModelOut])
def list_models(
    brand_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.view")),
):
    q = select(ProductModel).where(ProductModel.tenant_id == me.tenant_id, ProductModel.is_deleted.is_(False))
    if brand_id:
        q = q.where(ProductModel.brand_id == brand_id)
    models = db.scalars(q.order_by(ProductModel.name)).all()
    out: list[ModelOut] = []
    for m in models:
        mo = ModelOut.model_validate(m)
        mo.brand_name = m.brand.name if m.brand else ""
        out.append(mo)
    return out


@router.post("/models", response_model=ModelOut, status_code=201)
def create_model(
    body: ModelCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("brand.manage")),
):
    brand = db.get(Brand, body.brand_id)
    if not brand or brand.tenant_id != me.tenant_id or brand.is_deleted:
        raise HTTPException(404, "Marka bulunamadı.")
    name = body.name.strip()
    if db.scalar(
        select(ProductModel).where(
            ProductModel.tenant_id == me.tenant_id,
            ProductModel.brand_id == body.brand_id,
            func.lower(ProductModel.name) == name.lower(),
        )
    ):
        raise HTTPException(409, "Bu markada aynı model zaten kayıtlı.")
    m = ProductModel(
        tenant_id=me.tenant_id,
        brand_id=body.brand_id,
        name=name,
        specs=body.specs,
        description=body.description,
    )
    db.add(m)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="model.create",
        entity="model",
        entity_id=m.id,
        new={"brand": brand.name, "name": m.name},
        ip=client_ip(request),
    )
    db.commit()
    mo = ModelOut.model_validate(m)
    mo.brand_name = brand.name
    return mo


@router.patch("/models/{model_id}", response_model=ModelOut)
def update_model(
    model_id: uuid.UUID,
    body: ModelUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("brand.manage")),
):
    m = db.get(ProductModel, model_id)
    if not m or m.tenant_id != me.tenant_id or m.is_deleted:
        raise HTTPException(404, "Model bulunamadı.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="model.update",
        entity="model",
        entity_id=m.id,
        new=body.model_dump(exclude_unset=True),
        ip=client_ip(request),
    )
    db.commit()
    mo = ModelOut.model_validate(m)
    mo.brand_name = m.brand.name if m.brand else ""
    return mo


@router.delete("/models/{model_id}")
def delete_model(
    model_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("brand.manage")),
):
    m = db.get(ProductModel, model_id)
    if not m or m.tenant_id != me.tenant_id or m.is_deleted:
        raise HTTPException(404, "Model bulunamadı.")
    m.is_deleted = True
    m.is_active = False
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="model.delete",
        entity="model",
        entity_id=m.id,
        old={"name": m.name},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


# ==========================================
# 3. SUPPLIERS
# ==========================================
@router.get("/suppliers", response_model=list[SupplierOut])
def list_suppliers(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.view")),
):
    return db.scalars(
        select(Supplier).where(Supplier.tenant_id == me.tenant_id, Supplier.is_deleted.is_(False)).order_by(Supplier.name)
    ).all()


@router.post("/suppliers", response_model=SupplierOut, status_code=201)
def create_supplier(
    body: SupplierCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.create")),
):
    name = body.name.strip()
    if db.scalar(select(Supplier).where(Supplier.tenant_id == me.tenant_id, func.lower(Supplier.name) == name.lower())):
        raise HTTPException(409, "Bu tedarikçi zaten kayıtlı.")
    s = Supplier(tenant_id=me.tenant_id, **body.model_dump())
    s.name = name
    db.add(s)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="supplier.create",
        entity="supplier",
        entity_id=s.id,
        new={"name": s.name},
        ip=client_ip(request),
    )
    db.commit()
    return s


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: uuid.UUID,
    body: SupplierUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    s = db.get(Supplier, supplier_id)
    if not s or s.tenant_id != me.tenant_id or s.is_deleted:
        raise HTTPException(404, "Tedarikçi bulunamadı.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="supplier.update",
        entity="supplier",
        entity_id=s.id,
        new=body.model_dump(exclude_unset=True),
        ip=client_ip(request),
    )
    db.commit()
    return s


@router.delete("/suppliers/{supplier_id}")
def delete_supplier(
    supplier_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.delete")),
):
    s = db.get(Supplier, supplier_id)
    if not s or s.tenant_id != me.tenant_id or s.is_deleted:
        raise HTTPException(404, "Tedarikçi bulunamadı.")
    s.is_deleted = True
    s.is_active = False
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="supplier.delete",
        entity="supplier",
        entity_id=s.id,
        old={"name": s.name},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


# ==========================================
# 4. PRODUCTS (KATALOG & ADET BAZLI ÜRÜNLER)
# ==========================================
def _get_code_format(db: Session, tenant_id: uuid.UUID) -> tuple[str, int]:
    from app.models.core import Setting

    row = db.scalar(select(Setting).where(Setting.tenant_id == tenant_id, Setting.key == "general"))
    prefix = "KUP"
    digits = 2
    if row and isinstance(row.value, dict):
        prefix = str(row.value.get("code_prefix") or "KUP").strip().upper()
        try:
            digits = max(1, min(6, int(row.value.get("code_padding_digits", 2))))
        except (TypeError, ValueError):
            digits = 2
    return prefix, digits


def _next_inventory_code(db: Session, tenant_id: uuid.UUID, prefix: str) -> str:
    sys_prefix, digits = _get_code_format(db, tenant_id)
    count = db.scalar(select(func.count(Product.id)).where(Product.tenant_id == tenant_id)) or 0
    seq = count + 1
    while True:
        code = f"{sys_prefix}-{prefix}-{seq:0{digits}d}"
        exists = db.scalar(select(Product.id).where(Product.tenant_id == tenant_id, Product.inventory_code == code))
        if not exists:
            return code
        seq += 1


def _next_asset_code(db: Session, tenant_id: uuid.UUID, prod_code: str, start_idx: int) -> str:
    _, digits = _get_code_format(db, tenant_id)
    seq = start_idx
    while True:
        code = f"{prod_code}-{seq:0{digits}d}"
        exists = db.scalar(select(Asset.id).where(Asset.tenant_id == tenant_id, Asset.inventory_code == code))
        if not exists:
            return code
        seq += 1


def _resolve_brand_and_model(
    db: Session,
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID | None,
    brand_name: str | None,
    model_id: uuid.UUID | None,
    model_name: str | None,
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Kullanıcı marka veya modeli serbest metin olarak yazdığında bulur ya da otomatik oluşturur."""
    resolved_brand_id = brand_id
    if not resolved_brand_id and brand_name and brand_name.strip():
        bname = brand_name.strip()
        existing_b = db.scalar(
            select(Brand).where(Brand.tenant_id == tenant_id, func.lower(Brand.name) == bname.lower())
        )
        if existing_b:
            existing_b.is_deleted = False
            resolved_brand_id = existing_b.id
        else:
            nb = Brand(tenant_id=tenant_id, name=bname)
            db.add(nb)
            db.flush()
            resolved_brand_id = nb.id

    resolved_model_id = model_id
    if not resolved_model_id and model_name and model_name.strip() and resolved_brand_id:
        mname = model_name.strip()
        existing_m = db.scalar(
            select(ProductModel).where(
                ProductModel.tenant_id == tenant_id,
                ProductModel.brand_id == resolved_brand_id,
                func.lower(ProductModel.name) == mname.lower(),
            )
        )
        if existing_m:
            existing_m.is_deleted = False
            resolved_model_id = existing_m.id
        else:
            nm = ProductModel(tenant_id=tenant_id, brand_id=resolved_brand_id, name=mname)
            db.add(nm)
            db.flush()
            resolved_model_id = nm.id

    return resolved_brand_id, resolved_model_id


def _to_product_out(
    p: Product,
    asset_counts: dict[uuid.UUID, int],
    project_summaries: dict[uuid.UUID, str] | None = None,
    assigned_summaries: dict[uuid.UUID, str] | None = None,
    assigned_quantities: dict[uuid.UUID, Decimal] | None = None,
    warehouse_quantities: dict[uuid.UUID, Decimal] | None = None,
) -> ProductOut:
    po = ProductOut.model_validate(p)
    po.category_name = p.category.name if p.category else ""
    po.subcategory_name = p.subcategory.name if p.subcategory else None
    po.brand_name = p.brand.name if p.brand else None
    po.model_name = p.model.name if p.model else None
    po.supplier_name = p.supplier.name if p.supplier else None
    po.serial_asset_count = asset_counts.get(p.id, 0)
    po.primary_image_url = f"/api/v1/files/{p.primary_image_id}" if p.primary_image_id else None
    po.attributes = [AttributeItem(key=a.key, value=a.value) for a in p.attributes]
    if project_summaries:
        po.active_projects_summary = project_summaries.get(p.id)
    if assigned_summaries:
        po.assigned_summary = assigned_summaries.get(p.id)
    if assigned_quantities:
        po.assigned_quantity = assigned_quantities.get(p.id, Decimal("0"))
    if warehouse_quantities and p.id in warehouse_quantities:
        po.warehouse_quantity = warehouse_quantities[p.id]
    elif warehouse_quantities is not None:
        po.warehouse_quantity = Decimal("0")
    else:
        po.warehouse_quantity = p.quantity or Decimal("0")
    return po


@router.get("/products", response_model=list[ProductOut])
def list_products(
    q: str | None = Query(default=None, description="Ürün adı, envanter kodu veya barkod arama"),
    category_id: uuid.UUID | None = None,
    brand_id: uuid.UUID | None = None,
    tracking_type: str | None = None,
    status: str | None = None,
    is_fixture: bool | None = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.view")),
):
    stmt = select(Product).where(Product.tenant_id == me.tenant_id, Product.is_deleted.is_(False))
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if category_id:
        stmt = stmt.where(or_(Product.category_id == category_id, Product.subcategory_id == category_id))
    if brand_id:
        stmt = stmt.where(Product.brand_id == brand_id)
    if tracking_type:
        stmt = stmt.where(Product.tracking_type == tracking_type)
    if is_fixture is not None:
        if is_fixture:
            stmt = stmt.where(Product.is_fixture == True)
        else:
            stmt = stmt.where(or_(Product.is_fixture == False, Product.is_fixture.is_(None)))
    if status == "assigned":
        from app.models.warehouse_assignment import AssignmentItem, Assignment
        asg_prod_ids = select(AssignmentItem.product_id).join(Assignment, Assignment.id == AssignmentItem.assignment_id).where(
            Assignment.tenant_id == me.tenant_id,
            Assignment.is_deleted.is_(False),
            AssignmentItem.is_returned.is_(False),
        )
        asg_asset_prod_ids = select(Asset.product_id).where(
            Asset.tenant_id == me.tenant_id,
            Asset.is_deleted.is_(False),
            Asset.status == "assigned",
        )
        stmt = stmt.where(
            or_(
                Product.status == "assigned",
                Product.id.in_(asg_prod_ids),
                Product.id.in_(asg_asset_prod_ids),
            )
        )
    elif status == "in_project":
        from app.models.project_license_maintenance import ProjectAsset
        proj_prod_ids = select(ProjectAsset.product_id).where(
            ProjectAsset.tenant_id == me.tenant_id,
            ProjectAsset.status == "in_project",
        )
        proj_asset_prod_ids = select(Asset.product_id).where(
            Asset.tenant_id == me.tenant_id,
            Asset.is_deleted.is_(False),
            Asset.status == "in_project",
        )
        stmt = stmt.where(
            or_(
                Product.status == "in_project",
                Product.id.in_(proj_prod_ids),
                Product.id.in_(proj_asset_prod_ids),
            )
        )
    elif status == "in_warehouse":
        from app.models.warehouse_assignment import StockBalance
        wh_prod_ids = select(StockBalance.product_id).where(
            StockBalance.tenant_id == me.tenant_id,
            StockBalance.quantity > 0,
        )
        wh_asset_prod_ids = select(Asset.product_id).where(
            Asset.tenant_id == me.tenant_id,
            Asset.is_deleted.is_(False),
            Asset.status == "in_warehouse",
        )
        stmt = stmt.where(
            or_(
                Product.status == "in_warehouse",
                Product.id.in_(wh_prod_ids),
                Product.id.in_(wh_asset_prod_ids),
            )
        )
    elif status == "scrapped":
        scrapped_asset_prod_ids = select(Asset.product_id).where(
            Asset.tenant_id == me.tenant_id,
            Asset.is_deleted.is_(False),
            Asset.status == "scrapped",
        )
        stmt = stmt.where(
            or_(
                Product.status == "scrapped",
                Product.id.in_(scrapped_asset_prod_ids),
            )
        )
    elif status:
        stmt = stmt.where(Product.status == status)
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Product.name).like(term),
                func.lower(Product.inventory_code).like(term),
                func.lower(func.coalesce(Product.barcode, "")).like(term),
            )
        )
    products = db.scalars(stmt.order_by(Product.created_at.desc())).all()
    asset_counts = dict(
        db.execute(
            select(Asset.product_id, func.count(Asset.id))
            .where(Asset.tenant_id == me.tenant_id, Asset.is_deleted.is_(False))
            .group_by(Asset.product_id)
        ).all()
    )

    from app.models.project_license_maintenance import ProjectAsset
    from app.models.warehouse_assignment import AssignmentItem, Assignment, StockBalance

    proj_assets = db.scalars(
        select(ProjectAsset).where(
            ProjectAsset.tenant_id == me.tenant_id,
        )
    ).all()
    proj_map: dict[uuid.UUID, list[str]] = {}
    for pa in proj_assets:
        rem = pa.quantity - pa.returned_quantity
        if rem > 0 and pa.project and not pa.project.is_deleted:
            prod_unit = pa.product.unit if pa.product else "Adet"
            label = f"{pa.project.name} ({int(rem) if rem == int(rem) else rem} {prod_unit})"
            proj_map.setdefault(pa.product_id, []).append(label)
    proj_summaries = {k: ", ".join(v) for k, v in proj_map.items()}

    # Aktif zimmet kayıtları ve adetleri
    asg_items = db.scalars(
        select(AssignmentItem)
        .join(Assignment, Assignment.id == AssignmentItem.assignment_id)
        .where(
            Assignment.tenant_id == me.tenant_id,
            Assignment.is_deleted.is_(False),
            AssignmentItem.is_returned.is_(False),
        )
    ).all()
    asg_map: dict[uuid.UUID, list[str]] = {}
    asg_quantities: dict[uuid.UUID, Decimal] = {}
    for ai in asg_items:
        rem = ai.quantity - ai.returned_quantity
        if rem > 0 and ai.assignment and ai.assignment.employee:
            prod_unit = ai.product.unit if ai.product else "Adet"
            emp_name = ai.assignment.employee.full_name
            label = f"{emp_name} ({int(rem) if rem == int(rem) else rem} {prod_unit})"
            asg_map.setdefault(ai.product_id, []).append(label)
            asg_quantities[ai.product_id] = asg_quantities.get(ai.product_id, Decimal("0")) + rem
    asg_summaries = {k: ", ".join(v) for k, v in asg_map.items()}

    # Depo bakiyeleri (StockBalance toplamı)
    wh_balances = dict(
        db.execute(
            select(StockBalance.product_id, func.coalesce(func.sum(StockBalance.quantity), 0))
            .where(StockBalance.tenant_id == me.tenant_id)
            .group_by(StockBalance.product_id)
        ).all()
    )

    return [
        _to_product_out(
            p,
            asset_counts,
            proj_summaries,
            asg_summaries,
            asg_quantities,
            wh_balances,
        )
        for p in products
    ]


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.view")),
):
    p = db.get(Product, product_id)
    if not p or p.tenant_id != me.tenant_id or p.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")
    cnt = (
        db.scalar(
            select(func.count(Asset.id)).where(
                Asset.tenant_id == me.tenant_id, Asset.product_id == p.id, Asset.is_deleted.is_(False)
            )
        )
        or 0
    )

    from app.models.project_license_maintenance import ProjectAsset
    from app.models.warehouse_assignment import AssignmentItem, Assignment, StockBalance

    proj_assets = db.scalars(
        select(ProjectAsset).where(
            ProjectAsset.tenant_id == me.tenant_id,
            ProjectAsset.product_id == p.id,
        )
    ).all()
    labels: list[str] = []
    for pa in proj_assets:
        rem = pa.quantity - pa.returned_quantity
        if rem > 0 and pa.project and not pa.project.is_deleted:
            labels.append(f"{pa.project.name} ({int(rem) if rem == int(rem) else rem} {p.unit or 'Adet'})")
    proj_summary = {p.id: ", ".join(labels)} if labels else None

    asg_items = db.scalars(
        select(AssignmentItem)
        .join(Assignment, Assignment.id == AssignmentItem.assignment_id)
        .where(
            Assignment.tenant_id == me.tenant_id,
            Assignment.is_deleted.is_(False),
            AssignmentItem.product_id == p.id,
            AssignmentItem.is_returned.is_(False),
        )
    ).all()
    asg_labels: list[str] = []
    total_asg_qty = Decimal("0")
    for ai in asg_items:
        rem = ai.quantity - ai.returned_quantity
        if rem > 0 and ai.assignment and ai.assignment.employee:
            asg_labels.append(f"{ai.assignment.employee.full_name} ({int(rem) if rem == int(rem) else rem} {p.unit or 'Adet'})")
            total_asg_qty += rem
    asg_summary = {p.id: ", ".join(asg_labels)} if asg_labels else None

    wh_bal = db.scalar(
        select(func.coalesce(func.sum(StockBalance.quantity), 0))
        .where(StockBalance.tenant_id == me.tenant_id, StockBalance.product_id == p.id)
    ) or Decimal("0")

    return _to_product_out(
        p,
        {p.id: cnt},
        proj_summary,
        asg_summary,
        {p.id: total_asg_qty},
        {p.id: Decimal(str(wh_bal))},
    )


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(
    body: ProductCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.create")),
):
    cat = db.get(Category, body.category_id)
    if not cat or cat.tenant_id != me.tenant_id or cat.is_deleted:
        raise HTTPException(404, "Kategori bulunamadı.")

    inv_code = (body.inventory_code or "").strip().upper() or _next_inventory_code(db, me.tenant_id, cat.code)
    if db.scalar(select(Product).where(Product.tenant_id == me.tenant_id, Product.inventory_code == inv_code)):
        raise HTTPException(409, "Bu envanter kodu zaten kullanımda.")

    serials = [s.strip() for s in body.initial_serial_numbers if s.strip()]
    if len(serials) != len(set(serials)):
        raise HTTPException(422, "Girilen seri numaraları içinde mükerrer kayıt var.")
    if serials:
        existing_sn = db.scalars(
            select(Asset.serial_number).where(Asset.tenant_id == me.tenant_id, Asset.serial_number.in_(serials))
        ).all()
        if existing_sn:
            raise HTTPException(409, f"Şu seri numaraları zaten kayıtlı: {', '.join(existing_sn)}")

    qty = Decimal(str(len(serials))) if body.tracking_type == "serial" and serials else body.quantity
    val_date = body.last_valuation_date or (date.today() if body.current_market_value is not None else None)
    res_brand_id, res_model_id = _resolve_brand_and_model(
        db, me.tenant_id, body.brand_id, body.brand_name, body.model_id, body.model_name
    )

    p = Product(
        tenant_id=me.tenant_id,
        inventory_code=inv_code,
        name=body.name.strip(),
        category_id=body.category_id,
        subcategory_id=body.subcategory_id,
        brand_id=res_brand_id,
        model_id=res_model_id,
        tracking_type=body.tracking_type,
        unit=body.unit,
        barcode=body.barcode,
        description=body.description,
        technical_specs=body.technical_specs,
        min_stock=body.min_stock,
        quantity=qty,
        purchase_date=body.purchase_date,
        purchase_price=body.purchase_price,
        purchase_currency=body.purchase_currency,
        vat_rate=body.vat_rate,
        supplier_id=body.supplier_id,
        invoice_no=body.invoice_no,
        warranty_start=body.warranty_start,
        warranty_end=body.warranty_end,
        current_market_value=body.current_market_value,
        market_value_currency=body.market_value_currency,
        last_valuation_date=val_date,
        status=body.status,
        is_fixture=body.is_fixture,
        warehouse_name=body.warehouse_name,
        shelf_section=body.shelf_section,
        location_detail=body.location_detail,
        internal_notes=body.internal_notes,
        attributes=[ProductAttribute(key=a.key, value=a.value) for a in body.attributes],
    )
    db.add(p)
    db.flush()

    for idx, sn in enumerate(serials, start=1):
        acode = _next_asset_code(db, me.tenant_id, inv_code, idx)
        db.add(
            Asset(
                tenant_id=me.tenant_id,
                product_id=p.id,
                inventory_code=acode,
                serial_number=sn,
                qr_token=secrets.token_urlsafe(18),
                status=body.status,
                condition="new",
                warehouse_name=body.warehouse_name,
                shelf_section=body.shelf_section,
                location_detail=body.location_detail,
                purchase_date=body.purchase_date,
                purchase_price=body.purchase_price,
                purchase_currency=body.purchase_currency,
                vat_rate=body.vat_rate,
                supplier_id=body.supplier_id,
                invoice_no=body.invoice_no,
                warranty_start=body.warranty_start,
                warranty_end=body.warranty_end,
                current_market_value=body.current_market_value,
                market_value_currency=body.market_value_currency,
                last_valuation_date=val_date,
            )
        )

    # Adet bazlı ürün ise depoda otomatik StockBalance kaydı oluştur (varsayılan: Merkez Depo veya seçilen depo)
    from app.models.warehouse_assignment import Warehouse, StockBalance, WarehouseLocation

    wh = None
    if body.warehouse_name:
        wh = db.scalar(
            select(Warehouse).where(
                Warehouse.tenant_id == me.tenant_id,
                Warehouse.name == body.warehouse_name,
                Warehouse.is_deleted.is_(False),
            )
        )
    if not wh:
        wh = db.scalar(
            select(Warehouse).where(
                Warehouse.tenant_id == me.tenant_id,
                Warehouse.is_deleted.is_(False),
            ).order_by(Warehouse.created_at.asc())
        )
    
    loc = None
    if wh and body.shelf_section:
        loc = db.scalar(
            select(WarehouseLocation).where(
                WarehouseLocation.tenant_id == me.tenant_id,
                WarehouseLocation.warehouse_id == wh.id,
                WarehouseLocation.name == body.shelf_section,
                WarehouseLocation.is_active.is_(True),
            )
        )

    if wh and qty > 0:
        db.add(
            StockBalance(
                tenant_id=me.tenant_id,
                product_id=p.id,
                warehouse_id=wh.id,
                location_id=loc.id if loc else None,
                quantity=qty,
            )
        )

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="product.create",
        entity="product",
        entity_id=p.id,
        new={
            "inventory_code": p.inventory_code,
            "name": p.name,
            "tracking_type": p.tracking_type,
            "serial_count": len(serials),
        },
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(p)
    return _to_product_out(p, {p.id: len(serials)})


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: uuid.UUID,
    body: ProductUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    p = db.get(Product, product_id)
    if not p or p.tenant_id != me.tenant_id or p.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")

    old = {
        "name": p.name,
        "current_market_value": str(p.current_market_value) if p.current_market_value is not None else None,
        "status": p.status,
        "is_active": p.is_active,
    }
    updates = body.model_dump(exclude_unset=True)
    attrs = updates.pop("attributes", None)
    b_name = updates.pop("brand_name", None)
    m_name = updates.pop("model_name", None)

    if b_name is not None or m_name is not None or "brand_id" in updates or "model_id" in updates:
        rb_id, rm_id = _resolve_brand_and_model(
            db,
            me.tenant_id,
            updates.get("brand_id", p.brand_id),
            b_name,
            updates.get("model_id", p.model_id),
            m_name,
        )
        updates["brand_id"] = rb_id
        updates["model_id"] = rm_id

    if "current_market_value" in updates and updates["current_market_value"] != p.current_market_value:
        p.last_valuation_date = updates.get("last_valuation_date") or date.today()
        new_mval = updates["current_market_value"]
        new_mcurr = updates.get("market_value_currency") or p.market_value_currency
        for a in db.scalars(
            select(Asset).where(
                Asset.tenant_id == me.tenant_id,
                Asset.product_id == p.id,
                Asset.is_deleted.is_(False),
            )
        ):
            a.current_market_value = new_mval
            a.market_value_currency = new_mcurr
            a.last_valuation_date = p.last_valuation_date

    if "purchase_price" in updates and updates["purchase_price"] != p.purchase_price:
        new_pprice = updates["purchase_price"]
        new_pcurr = updates.get("purchase_currency") or p.purchase_currency
        for a in db.scalars(
            select(Asset).where(
                Asset.tenant_id == me.tenant_id,
                Asset.product_id == p.id,
                Asset.is_deleted.is_(False),
            )
        ):
            a.purchase_price = new_pprice
            a.purchase_currency = new_pcurr

    for k, v in updates.items():
        setattr(p, k, v)

    # Ürün miktar güncellemesi yapıldıysa veya depodaki StockBalance yoksa senkronize et
    from app.models.warehouse_assignment import Warehouse, StockBalance

    wh = db.scalar(
        select(Warehouse).where(
            Warehouse.tenant_id == me.tenant_id,
            Warehouse.is_deleted.is_(False),
            Warehouse.name == (p.warehouse_name or "Merkez Depo"),
        )
    ) or db.scalar(
        select(Warehouse).where(
            Warehouse.tenant_id == me.tenant_id,
            Warehouse.is_deleted.is_(False),
        ).order_by(Warehouse.created_at.asc())
    )
    if wh:
        sb = db.scalar(
            select(StockBalance).where(
                StockBalance.tenant_id == me.tenant_id,
                StockBalance.product_id == p.id,
            )
        )
        if not sb:
            if p.quantity > 0:
                db.add(
                    StockBalance(
                        tenant_id=me.tenant_id,
                        product_id=p.id,
                        warehouse_id=wh.id,
                        quantity=p.quantity,
                    )
                )
        elif "quantity" in updates:
            sb.quantity = p.quantity

    if attrs is not None:
        p.attributes.clear()
        for a in attrs:
            p.attributes.append(ProductAttribute(key=a["key"], value=a["value"]))

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="product.update",
        entity="product",
        entity_id=p.id,
        old=old,
        new={k: str(v) for k, v in updates.items()},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(p)
    cnt = (
        db.scalar(
            select(func.count(Asset.id)).where(
                Asset.tenant_id == me.tenant_id, Asset.product_id == p.id, Asset.is_deleted.is_(False)
            )
        )
        or 0
    )
    return _to_product_out(p, {p.id: cnt})


@router.delete("/products/{product_id}")
def delete_product(
    product_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.delete")),
):
    from app.models.warehouse_assignment import StockBalance

    p = db.get(Product, product_id)
    if not p or p.tenant_id != me.tenant_id or p.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")
    p.is_deleted = True
    p.is_active = False
    p.quantity = Decimal("0")
    for a in db.scalars(select(Asset).where(Asset.tenant_id == me.tenant_id, Asset.product_id == p.id)):
        a.is_deleted = True
        a.is_active = False
    for sb in db.scalars(select(StockBalance).where(StockBalance.tenant_id == me.tenant_id, StockBalance.product_id == p.id)):
        db.delete(sb)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="product.delete",
        entity="product",
        entity_id=p.id,
        old={"inventory_code": p.inventory_code, "name": p.name},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


@router.post("/products/{product_id}/scrap", response_model=ProductOut)
def scrap_product(
    product_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    """Ürünü ve bağlı tüm seri varlıklarını doğrudan hurdaya ayırır."""
    from app.models.warehouse_assignment import StockBalance

    p = db.get(Product, product_id)
    if not p or p.tenant_id != me.tenant_id or p.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")

    old_status = p.status
    p.status = "scrapped"
    p.current_market_value = Decimal("0")

    # Bağlı tüm seri cihazların statüsünü de hurdaya (scrapped) çek ve piyasa değerini 0 yap
    for a in db.scalars(select(Asset).where(Asset.tenant_id == me.tenant_id, Asset.product_id == p.id, Asset.is_deleted.is_(False))):
        a.status = "scrapped"
        a.current_market_value = Decimal("0")

    # Depo bakiye sıfırla (hurda artık depoda kullanılabilir stok değil)
    for sb in db.scalars(select(StockBalance).where(StockBalance.tenant_id == me.tenant_id, StockBalance.product_id == p.id)):
        sb.quantity = Decimal("0")

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="product.scrap",
        entity="product",
        entity_id=p.id,
        old={"status": old_status},
        new={"status": "scrapped"},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(p)
    cnt = (
        db.scalar(
            select(func.count(Asset.id)).where(
                Asset.tenant_id == me.tenant_id, Asset.product_id == p.id, Asset.is_deleted.is_(False)
            )
        )
        or 0
    )
    return _to_product_out(p, {p.id: cnt})


@router.post("/products/{product_id}/unscrap", response_model=ProductOut)
def unscrap_product(
    product_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    """Hurdaya ayrılmış ürünü ve bağlı cihazları tekrar aktif depoya/envantere kazandırır."""
    from app.models.warehouse_assignment import Warehouse, StockBalance

    p = db.get(Product, product_id)
    if not p or p.tenant_id != me.tenant_id or p.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")

    old_status = p.status
    p.status = "in_warehouse"

    # Bağlı hurda seri cihazları da depoya geri döndür
    for a in db.scalars(select(Asset).where(Asset.tenant_id == me.tenant_id, Asset.product_id == p.id, Asset.is_deleted.is_(False))):
        if a.status == "scrapped":
            a.status = "in_warehouse"

    # Depo bakiyesini tekrar sağla
    wh = db.scalar(
        select(Warehouse).where(
            Warehouse.tenant_id == me.tenant_id,
            Warehouse.is_deleted.is_(False),
            Warehouse.name == (p.warehouse_name or "Merkez Depo"),
        )
    ) or db.scalar(
        select(Warehouse).where(
            Warehouse.tenant_id == me.tenant_id,
            Warehouse.is_deleted.is_(False),
        ).order_by(Warehouse.created_at.asc())
    )

    if wh and p.tracking_type == "quantity":
        sb = db.scalar(
            select(StockBalance).where(
                StockBalance.tenant_id == me.tenant_id,
                StockBalance.product_id == p.id,
                StockBalance.warehouse_id == wh.id,
            )
        )
        if sb:
            sb.quantity = p.quantity or Decimal("1")
        else:
            db.add(
                StockBalance(
                    tenant_id=me.tenant_id,
                    product_id=p.id,
                    warehouse_id=wh.id,
                    quantity=p.quantity or Decimal("1"),
                )
            )

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="product.unscrap",
        entity="product",
        entity_id=p.id,
        old={"status": old_status},
        new={"status": "in_warehouse"},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(p)
    cnt = (
        db.scalar(
            select(func.count(Asset.id)).where(
                Asset.tenant_id == me.tenant_id, Asset.product_id == p.id, Asset.is_deleted.is_(False)
            )
        )
        or 0
    )
    return _to_product_out(p, {p.id: cnt})


# ==========================================
# 5. ASSETS (SERİ NUMARALI VARLIKLAR)
# ==========================================
def _to_asset_out(a: Asset) -> AssetOut:
    ao = AssetOut.model_validate(a)
    if a.product:
        ao.product_name = a.product.name
        ao.brand_name = a.product.brand.name if a.product.brand else None
        ao.model_name = a.product.model.name if a.product.model else None
        ao.category_name = a.product.category.name if a.product.category else ""
    ao.supplier_name = a.supplier.name if a.supplier else None
    img_id = a.primary_image_id or (a.product.primary_image_id if a.product else None)
    ao.primary_image_url = f"/api/v1/files/{img_id}" if img_id else None
    return ao


@router.get("/assets", response_model=list[AssetOut])
def list_assets(
    product_id: uuid.UUID | None = None,
    status: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.view")),
):
    stmt = select(Asset).where(Asset.tenant_id == me.tenant_id, Asset.is_deleted.is_(False))
    if product_id:
        stmt = stmt.where(Asset.product_id == product_id)
    if status:
        stmt = stmt.where(Asset.status == status)
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Asset.serial_number).like(term),
                func.lower(Asset.inventory_code).like(term),
                func.lower(func.coalesce(Asset.warehouse_name, "")).like(term),
            )
        )
    assets = db.scalars(stmt.order_by(Asset.created_at.desc())).all()
    return [_to_asset_out(a) for a in assets]


@router.post("/assets", response_model=AssetOut, status_code=201)
def create_asset(
    body: AssetCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.create")),
):
    p = db.get(Product, body.product_id)
    if not p or p.tenant_id != me.tenant_id or p.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")
    sn = body.serial_number.strip()
    if db.scalar(select(Asset).where(Asset.tenant_id == me.tenant_id, Asset.serial_number == sn)):
        raise HTTPException(409, "Bu seri numarası zaten sistemde kayıtlı.")

    existing_cnt = (
        db.scalar(select(func.count(Asset.id)).where(Asset.tenant_id == me.tenant_id, Asset.product_id == p.id)) or 0
    )
    acode = (body.inventory_code or "").strip().upper() or _next_asset_code(
        db, me.tenant_id, p.inventory_code, existing_cnt + 1
    )

    a = Asset(
        tenant_id=me.tenant_id,
        product_id=p.id,
        inventory_code=acode,
        serial_number=sn,
        barcode=body.barcode,
        qr_token=secrets.token_urlsafe(18),
        status=body.status,
        condition=body.condition,
        warehouse_name=body.warehouse_name or p.warehouse_name,
        shelf_section=body.shelf_section or p.shelf_section,
        location_detail=body.location_detail or p.location_detail,
        purchase_date=body.purchase_date or p.purchase_date,
        purchase_price=body.purchase_price if body.purchase_price is not None else p.purchase_price,
        purchase_currency=body.purchase_currency or p.purchase_currency,
        vat_rate=body.vat_rate,
        supplier_id=body.supplier_id or p.supplier_id,
        invoice_no=body.invoice_no or p.invoice_no,
        warranty_start=body.warranty_start or p.warranty_start,
        warranty_end=body.warranty_end or p.warranty_end,
        current_market_value=body.current_market_value
        if body.current_market_value is not None
        else p.current_market_value,
        market_value_currency=body.market_value_currency or p.market_value_currency,
        last_valuation_date=date.today() if body.current_market_value is not None else p.last_valuation_date,
        notes=body.notes,
    )
    db.add(a)
    p.quantity = Decimal(str(existing_cnt + 1))
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="asset.create",
        entity="asset",
        entity_id=a.id,
        new={"serial_number": a.serial_number, "inventory_code": a.inventory_code},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(a)
    return _to_asset_out(a)


@router.post("/assets/bulk", response_model=list[AssetOut], status_code=201)
def bulk_create_assets(
    body: AssetBulkCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.create")),
):
    p = db.get(Product, body.product_id)
    if not p or p.tenant_id != me.tenant_id or p.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")

    serials = [s.strip() for s in body.serial_numbers if s.strip()]
    if not serials:
        raise HTTPException(422, "En az bir seri numarası girilmelidir.")
    if len(serials) != len(set(serials)):
        raise HTTPException(422, "Girilen listede tekrarlayan seri numarası var.")

    dup = db.scalars(
        select(Asset.serial_number).where(Asset.tenant_id == me.tenant_id, Asset.serial_number.in_(serials))
    ).all()
    if dup:
        raise HTTPException(409, f"Şu seri numaraları zaten kayıtlı: {', '.join(dup)}")

    existing_cnt = (
        db.scalar(select(func.count(Asset.id)).where(Asset.tenant_id == me.tenant_id, Asset.product_id == p.id)) or 0
    )
    created: list[Asset] = []
    for i, sn in enumerate(serials, start=1):
        acode = _next_asset_code(db, me.tenant_id, p.inventory_code, existing_cnt + i)
        a = Asset(
            tenant_id=me.tenant_id,
            product_id=p.id,
            inventory_code=acode,
            serial_number=sn,
            qr_token=secrets.token_urlsafe(18),
            status=body.status,
            condition=body.condition,
            warehouse_name=body.warehouse_name or p.warehouse_name,
            shelf_section=body.shelf_section or p.shelf_section,
            location_detail=body.location_detail or p.location_detail,
            purchase_date=body.purchase_date or p.purchase_date,
            purchase_price=body.purchase_price if body.purchase_price is not None else p.purchase_price,
            purchase_currency=body.purchase_currency or p.purchase_currency,
            vat_rate=body.vat_rate,
            supplier_id=body.supplier_id or p.supplier_id,
            invoice_no=body.invoice_no or p.invoice_no,
            warranty_start=body.warranty_start or p.warranty_start,
            warranty_end=body.warranty_end or p.warranty_end,
            current_market_value=body.current_market_value
            if body.current_market_value is not None
            else p.current_market_value,
            market_value_currency=body.market_value_currency or p.market_value_currency,
            last_valuation_date=date.today() if body.current_market_value is not None else p.last_valuation_date,
            notes=body.notes,
        )
        db.add(a)
        created.append(a)

    p.quantity = Decimal(str(existing_cnt + len(created)))
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="asset.bulk_create",
        entity="product",
        entity_id=p.id,
        new={"count": len(created), "serial_numbers": serials},
        ip=client_ip(request),
    )
    db.commit()
    for a in created:
        db.refresh(a)
    return [_to_asset_out(a) for a in created]


@router.patch("/assets/{asset_id}", response_model=AssetOut)
def update_asset(
    asset_id: uuid.UUID,
    body: AssetUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    a = db.get(Asset, asset_id)
    if not a or a.tenant_id != me.tenant_id or a.is_deleted:
        raise HTTPException(404, "Varlık bulunamadı.")
    old = {"status": a.status, "warehouse_name": a.warehouse_name, "condition": a.condition}
    updates = body.model_dump(exclude_unset=True)
    if "current_market_value" in updates and updates["current_market_value"] != a.current_market_value:
        a.last_valuation_date = updates.get("last_valuation_date") or date.today()
    for k, v in updates.items():
        setattr(a, k, v)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="asset.update",
        entity="asset",
        entity_id=a.id,
        old=old,
        new={k: str(v) for k, v in updates.items()},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(a)
    return _to_asset_out(a)


@router.delete("/assets/{asset_id}")
def delete_asset(
    asset_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.delete")),
):
    a = db.get(Asset, asset_id)
    if not a or a.tenant_id != me.tenant_id or a.is_deleted:
        raise HTTPException(404, "Cihaz bulunamadı.")
    a.is_deleted = True
    a.is_active = False
    if a.product:
        cnt = (
            db.scalar(
                select(func.count(Asset.id)).where(
                    Asset.tenant_id == me.tenant_id, Asset.product_id == a.product_id, Asset.is_deleted.is_(False)
                )
            )
            or 0
        )
        a.product.quantity = Decimal(str(cnt))
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="asset.delete",
        entity="asset",
        entity_id=a.id,
        old={"serial_number": a.serial_number, "inventory_code": a.inventory_code},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


@router.post("/assets/{asset_id}/scrap", response_model=AssetOut)
def scrap_asset(
    asset_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    """Tek bir seri numaralı cihazı doğrudan hurdaya ayırır."""
    a = db.get(Asset, asset_id)
    if not a or a.tenant_id != me.tenant_id or a.is_deleted:
        raise HTTPException(404, "Cihaz bulunamadı.")

    old_status = a.status
    a.status = "scrapped"
    a.current_market_value = Decimal("0")

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="asset.scrap",
        entity="asset",
        entity_id=a.id,
        old={"status": old_status},
        new={"status": "scrapped"},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(a)
    return _to_asset_out(a)


@router.post("/assets/{asset_id}/unscrap", response_model=AssetOut)
def unscrap_asset(
    asset_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    """Hurdaya ayrılmış tekil seri numaralı cihazı tekrar depoya/envantere kazandırır."""
    a = db.get(Asset, asset_id)
    if not a or a.tenant_id != me.tenant_id or a.is_deleted:
        raise HTTPException(404, "Cihaz bulunamadı.")

    old_status = a.status
    a.status = "in_warehouse"

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="asset.unscrap",
        entity="asset",
        entity_id=a.id,
        old={"status": old_status},
        new={"status": "in_warehouse"},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(a)
    return _to_asset_out(a)


# ==========================================
# 6. PUBLIC QR TOKEN LOOKUP (HASSAS VERİ İÇERMEZ)
# ==========================================
@router.get("/q/{qr_token}")
def public_qr_lookup(qr_token: str, db: Session = Depends(get_db)):
    """QR kod okutulduğunda finansal veya gizli bilgi olmadan ürünün temel kimlik ve konumunu döner."""
    a = db.scalar(select(Asset).where(Asset.qr_token == qr_token, Asset.is_deleted.is_(False)))
    if not a:
        raise HTTPException(404, "QR koduna ait aktif varlık bulunamadı.")
    p = a.product
    img_id = a.primary_image_id or (p.primary_image_id if p else None)
    return {
        "inventory_code": a.inventory_code,
        "product_name": p.name if p else "",
        "brand": p.brand.name if p and p.brand else None,
        "model": p.model.name if p and p.model else None,
        "serial_number": a.serial_number,
        "status": a.status,
        "condition": a.condition,
        "warehouse": a.warehouse_name,
        "shelf_section": a.shelf_section,
        "location": a.location_detail,
        "photo_url": f"/api/v1/files/{img_id}" if img_id else None,
    }


# ==========================================
# 7. GERÇEK VERİTABANI ÖZET İSTATİSTİKLERİ (DASHBOARD İÇİN)
# ==========================================
@router.get("/inventory/summary")
def inventory_summary(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("dashboard.view")),
):
    """Hiçbir sahte veri üretmeden yalnızca gerçek veritabanı kayıtlarından anlık özet hesaplar."""
    products = db.scalars(
        select(Product).where(Product.tenant_id == me.tenant_id, Product.is_deleted.is_(False), Product.is_active.is_(True))
    ).all()
    assets = db.scalars(
        select(Asset).where(Asset.tenant_id == me.tenant_id, Asset.is_deleted.is_(False), Asset.is_active.is_(True))
    ).all()

    total_products = len(products)
    total_serial_assets = len(assets)
    quantity_units = sum((p.quantity for p in products if p.tracking_type == "quantity"), Decimal("0"))
    total_physical_units = Decimal(str(total_serial_assets)) + quantity_units

    cost_by_currency: dict[str, Decimal] = {"TRY": Decimal("0"), "USD": Decimal("0"), "EUR": Decimal("0")}
    market_by_currency: dict[str, Decimal] = {"TRY": Decimal("0"), "USD": Decimal("0"), "EUR": Decimal("0")}
    book_value_by_currency: dict[str, Decimal] = {"TRY": Decimal("0"), "USD": Decimal("0"), "EUR": Decimal("0")}

    operational_market_value_by_currency: dict[str, Decimal] = {"TRY": Decimal("0"), "USD": Decimal("0"), "EUR": Decimal("0")}
    fixture_market_value_by_currency: dict[str, Decimal] = {"TRY": Decimal("0"), "USD": Decimal("0"), "EUR": Decimal("0")}

    fixture_cost_by_currency: dict[str, Decimal] = {"TRY": Decimal("0"), "USD": Decimal("0"), "EUR": Decimal("0")}
    fixture_book_value_by_currency: dict[str, Decimal] = {"TRY": Decimal("0"), "USD": Decimal("0"), "EUR": Decimal("0")}

    prod_by_id = {p.id: p for p in products}

    for a in assets:
        if a.status == "scrapped":
            continue
        prod = prod_by_id.get(a.product_id)
        is_fix = getattr(prod, "is_fixture", False) if prod else False
        p_price = a.purchase_price if a.purchase_price is not None else (prod.purchase_price if prod else None)

        if p_price is not None:
            c = a.purchase_currency if a.purchase_currency in cost_by_currency else (prod.purchase_currency if prod and prod.purchase_currency in cost_by_currency else "TRY")
            cost_by_currency[c] += p_price
            if is_fix:
                fixture_cost_by_currency[c] += p_price

            # Net Defter Değeri (Amortisman Hesabı: 5 yıllık doğrusal amortisman, yıllık %20)
            p_date = a.purchase_date or (prod.purchase_date if prod else None)
            if p_date:
                years_used = max(0.0, (date.today() - p_date).days / 365.25)
                ratio = max(0.0, 1.0 - (years_used * 0.20))
                bv = p_price * Decimal(str(ratio))
            else:
                bv = p_price
            book_value_by_currency[c] += bv
            if is_fix:
                fixture_book_value_by_currency[c] += bv

        if a.current_market_value is not None:
            mc = a.market_value_currency if a.market_value_currency in market_by_currency else "TRY"
            market_by_currency[mc] += a.current_market_value
            if is_fix:
                fixture_market_value_by_currency[mc] += a.current_market_value
            else:
                operational_market_value_by_currency[mc] += a.current_market_value

    for p in products:
        if p.status == "scrapped":
            continue
        if p.tracking_type == "quantity":
            is_fix = getattr(p, "is_fixture", False)
            if p.purchase_price is not None:
                c = p.purchase_currency if p.purchase_currency in cost_by_currency else "TRY"
                total_p_cost = p.purchase_price * p.quantity
                cost_by_currency[c] += total_p_cost
                if is_fix:
                    fixture_cost_by_currency[c] += total_p_cost

                if p.purchase_date:
                    years_used = max(0.0, (date.today() - p.purchase_date).days / 365.25)
                    ratio = max(0.0, 1.0 - (years_used * 0.20))
                    bv = total_p_cost * Decimal(str(ratio))
                else:
                    bv = total_p_cost
                book_value_by_currency[c] += bv
                if is_fix:
                    fixture_book_value_by_currency[c] += bv

            if p.current_market_value is not None:
                mc = p.market_value_currency if p.market_value_currency in market_by_currency else "TRY"
                total_mkt = p.current_market_value * p.quantity
                market_by_currency[mc] += total_mkt
                if is_fix:
                    fixture_market_value_by_currency[mc] += total_mkt
                else:
                    operational_market_value_by_currency[mc] += total_mkt

    status_counts: dict[str, int] = {
        "active": 0,
        "in_warehouse": 0,
        "in_project": 0,
        "assigned": 0,
        "faulty": 0,
        "in_service": 0,
        "scrapped": 0,
    }
    for a in assets:
        if a.status in status_counts:
            status_counts[a.status] += 1

    from app.models.warehouse_assignment import Assignment, AssignmentItem, StockBalance
    from app.models.project_license_maintenance import ProjectAsset

    # Adet bazlı ürünlerin fiziksel konumlarına göre dağılımı:
    # 1. Depolardaki stok bakiyeleri (StockBalance toplamı)
    wh_units = db.scalar(
        select(func.coalesce(func.sum(StockBalance.quantity), 0)).where(
            StockBalance.tenant_id == me.tenant_id
        )
    ) or Decimal("0")

    # 2. Aktif personel zimmetindeki adetler
    asg_units = db.scalar(
        select(func.coalesce(func.sum(AssignmentItem.quantity - AssignmentItem.returned_quantity), 0))
        .join(Assignment, Assignment.id == AssignmentItem.assignment_id)
        .where(
            Assignment.tenant_id == me.tenant_id,
            Assignment.is_deleted.is_(False),
            AssignmentItem.is_returned.is_(False),
            AssignmentItem.asset_id.is_(None),  # Seri numaralı cihazlar zaten assets listesinden sayıldı
        )
    ) or Decimal("0")

    # 3. Aktif projelerdeki adetler
    proj_units = db.scalar(
        select(func.coalesce(func.sum(ProjectAsset.quantity - ProjectAsset.returned_quantity), 0)).where(
            ProjectAsset.tenant_id == me.tenant_id,
            ProjectAsset.status == "in_project",
            ProjectAsset.asset_id.is_(None),
        )
    ) or Decimal("0")

    # 4. Hurdaya ayrılmış ürünler (hem adetli ürünler hem de altında seri varlığı açılmamış ürünler)
    # Seri varlıkları olanlar zaten yukarıdaki 'for a in assets: status_counts[a.status] += 1' ile sayıldı.
    scrapped_products = db.scalars(
        select(Product).where(
            Product.tenant_id == me.tenant_id,
            Product.is_deleted.is_(False),
            Product.is_active.is_(True),
            Product.status == "scrapped",
        )
    ).all()

    for sp in scrapped_products:
        if sp.tracking_type == "quantity":
            status_counts["scrapped"] += int(sp.quantity or 0)
        else:
            # Seri takipli bir ürün hurdaya çıkarılmışsa ve altında henüz hiç asset oluşmamışsa miktarını ekle
            asset_count_for_prod = sum(1 for a in assets if a.product_id == sp.id)
            if asset_count_for_prod == 0:
                status_counts["scrapped"] += int(sp.quantity or 1)

    status_counts["in_warehouse"] += int(wh_units)
    status_counts["assigned"] += int(asg_units)
    status_counts["in_project"] += int(proj_units)

    cat_distribution: dict[str, int] = {}
    for p in products:
        cname = p.category.name if p.category else "Diğer"
        cat_distribution[cname] = cat_distribution.get(cname, 0) + 1

    brand_distribution: dict[str, int] = {}
    for p in products:
        if p.brand:
            brand_distribution[p.brand.name] = brand_distribution.get(p.brand.name, 0) + 1

    from app.models.project_license_maintenance import SoftwareLicense
    from app.api.v1.finance_count_system import get_latest_rates

    rates = get_latest_rates(db, me.tenant_id)
    rates_dict = {k: float(v) for k, v in rates.items()}

    licenses = db.scalars(
        select(SoftwareLicense).where(
            SoftwareLicense.tenant_id == me.tenant_id,
            SoftwareLicense.is_deleted.is_(False),
            SoftwareLicense.is_active.is_(True),
        )
    ).all()
    active_licenses = len(licenses)
    upcoming_renewals = sum(
        1 for lic in licenses if lic.end_date is not None and 0 <= (lic.end_date - date.today()).days <= 30
    )

    return {
        "total_product_cards": total_products,
        "total_serial_assets": total_serial_assets,
        "total_physical_units": float(total_physical_units),
        "total_fixture_units": sum(1 for p in products if getattr(p, "is_fixture", False)),
        "purchase_cost_by_currency": {k: float(v) for k, v in cost_by_currency.items()},
        "market_value_by_currency": {k: float(v) for k, v in market_by_currency.items()},
        "operational_market_value_by_currency": {k: float(v) for k, v in operational_market_value_by_currency.items()},
        "fixture_market_value_by_currency": {k: float(v) for k, v in fixture_market_value_by_currency.items()},
        "book_value_by_currency": {k: float(v) for k, v in book_value_by_currency.items()},
        "fixture_cost_by_currency": {k: float(v) for k, v in fixture_cost_by_currency.items()},
        "fixture_book_value_by_currency": {k: float(v) for k, v in fixture_book_value_by_currency.items()},
        "exchange_rates": rates_dict,
        "status_counts": status_counts,
        "active_software_licenses": active_licenses,
        "upcoming_license_renewals": upcoming_renewals,
        "category_distribution": [{"name": k, "value": v} for k, v in cat_distribution.items()],
        "brand_distribution": [{"name": k, "value": v} for k, v in brand_distribution.items()],
    }
