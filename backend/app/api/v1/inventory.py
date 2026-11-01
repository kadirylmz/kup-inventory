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
    me: User = Depends(require_permission("category.view")),
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
    me: User = Depends(require_permission("brand.view")),
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


@router.get("/models", response_model=list[ModelOut])
def list_models(
    brand_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("brand.view")),
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


# ==========================================
# 4. PRODUCTS (KATALOG & ADET BAZLI ÜRÜNLER)
# ==========================================
def _next_inventory_code(db: Session, tenant_id: uuid.UUID, prefix: str) -> str:
    count = db.scalar(select(func.count(Product.id)).where(Product.tenant_id == tenant_id)) or 0
    seq = count + 1
    while True:
        code = f"KUP-{prefix}-{seq:04d}"
        exists = db.scalar(select(Product.id).where(Product.tenant_id == tenant_id, Product.inventory_code == code))
        if not exists:
            return code
        seq += 1


def _next_asset_code(db: Session, tenant_id: uuid.UUID, prod_code: str, start_idx: int) -> str:
    seq = start_idx
    while True:
        code = f"{prod_code}-{seq:03d}"
        exists = db.scalar(select(Asset.id).where(Asset.tenant_id == tenant_id, Asset.inventory_code == code))
        if not exists:
            return code
        seq += 1


def _to_product_out(p: Product, asset_counts: dict[uuid.UUID, int]) -> ProductOut:
    po = ProductOut.model_validate(p)
    po.category_name = p.category.name if p.category else ""
    po.subcategory_name = p.subcategory.name if p.subcategory else None
    po.brand_name = p.brand.name if p.brand else None
    po.model_name = p.model.name if p.model else None
    po.supplier_name = p.supplier.name if p.supplier else None
    po.serial_asset_count = asset_counts.get(p.id, 0)
    po.primary_image_url = f"/api/v1/files/{p.primary_image_id}" if p.primary_image_id else None
    po.attributes = [AttributeItem(key=a.key, value=a.value) for a in p.attributes]
    return po


@router.get("/products", response_model=list[ProductOut])
def list_products(
    q: str | None = Query(default=None, description="Ürün adı, envanter kodu veya barkod arama"),
    category_id: uuid.UUID | None = None,
    brand_id: uuid.UUID | None = None,
    tracking_type: str | None = None,
    status: str | None = None,
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
    if status:
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
    return [_to_product_out(p, asset_counts) for p in products]


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
    return _to_product_out(p, {p.id: cnt})


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

    p = Product(
        tenant_id=me.tenant_id,
        inventory_code=inv_code,
        name=body.name.strip(),
        category_id=body.category_id,
        subcategory_id=body.subcategory_id,
        brand_id=body.brand_id,
        model_id=body.model_id,
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

    if "current_market_value" in updates and updates["current_market_value"] != p.current_market_value:
        p.last_valuation_date = updates.get("last_valuation_date") or date.today()

    for k, v in updates.items():
        setattr(p, k, v)

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

    for a in assets:
        if a.purchase_price is not None:
            c = a.purchase_currency if a.purchase_currency in cost_by_currency else "TRY"
            cost_by_currency[c] += a.purchase_price
        if a.current_market_value is not None:
            mc = a.market_value_currency if a.market_value_currency in market_by_currency else "TRY"
            market_by_currency[mc] += a.current_market_value

    for p in products:
        if p.tracking_type == "quantity":
            if p.purchase_price is not None:
                c = p.purchase_currency if p.purchase_currency in cost_by_currency else "TRY"
                cost_by_currency[c] += p.purchase_price * p.quantity
            if p.current_market_value is not None:
                mc = p.market_value_currency if p.market_value_currency in market_by_currency else "TRY"
                market_by_currency[mc] += p.current_market_value * p.quantity

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
    for p in products:
        if p.tracking_type == "quantity" and p.status in status_counts:
            status_counts[p.status] += 1

    cat_distribution: dict[str, int] = {}
    for p in products:
        cname = p.category.name if p.category else "Diğer"
        cat_distribution[cname] = cat_distribution.get(cname, 0) + 1

    brand_distribution: dict[str, int] = {}
    for p in products:
        if p.brand:
            brand_distribution[p.brand.name] = brand_distribution.get(p.brand.name, 0) + 1

    from app.models.project_license_maintenance import SoftwareLicense

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
        "purchase_cost_by_currency": {k: float(v) for k, v in cost_by_currency.items()},
        "market_value_by_currency": {k: float(v) for k, v in market_by_currency.items()},
        "status_counts": status_counts,
        "active_software_licenses": active_licenses,
        "upcoming_license_renewals": upcoming_renewals,
        "category_distribution": [{"name": k, "value": v} for k, v in cat_distribution.items()],
        "brand_distribution": [{"name": k, "value": v} for k, v in brand_distribution.items()],
    }
