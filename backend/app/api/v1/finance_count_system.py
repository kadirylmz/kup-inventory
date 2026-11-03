import hashlib
import json
import os
import secrets
import socket
import uuid
import zipfile
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.warehouse_assignment import _adjust_balance, _next_no
from app.core.config import get_settings
from app.core.deps import client_ip, has_permission, require_permission, write_audit
from app.db.session import get_db
from app.models.core import AuditLog, Employee, Setting, User
from app.models.finance_count_system import (
    AppLicense,
    AppLicenseActivation,
    BackupRecord,
    DepreciationRecord,
    ExchangeRate,
    Notification,
    PurchaseRecord,
    Stocktake,
    StocktakeApproval,
    StocktakeItem,
    Valuation,
)
from app.models.inventory import Asset, Brand, Category, Product, ProductModel
from app.models.project_license_maintenance import (
    MaintenanceRecord,
    Project,
    ProjectAsset,
    ServiceRecord,
    SoftwareLicense,
)
from app.models.warehouse_assignment import (
    Assignment,
    AssignmentItem,
    StockBalance,
    StockMovement,
    StockMovementItem,
    Warehouse,
)

router = APIRouter(tags=["finance, stocktake, reports & system"])


# ==========================================
# YARDIMCI: KUR ÇEVİRİMİ
# ==========================================
def get_latest_rates(db: Session, tenant_id: uuid.UUID) -> dict[str, Decimal]:
    rates: dict[str, Decimal] = {"TRY": Decimal("1.0"), "USD": Decimal("35.0"), "EUR": Decimal("38.0")}
    rows = db.scalars(
        select(ExchangeRate)
        .where(ExchangeRate.tenant_id == tenant_id, ExchangeRate.is_deleted.is_(False))
        .order_by(ExchangeRate.rate_date.asc(), ExchangeRate.created_at.asc())
    ).all()
    for r in rows:
        rates[r.currency_code] = r.rate_to_try
    rates["TRY"] = Decimal("1.0")
    return rates


def to_try(amount: Decimal | None, currency: str, rates: dict[str, Decimal]) -> Decimal:
    if amount is None:
        return Decimal("0")
    return amount * rates.get(currency, Decimal("1.0"))


# ==========================================
# 1. PHASE 5: DÖVİZ KURLARI, DEĞERLEME, ALIŞ KAYDI, AMORTİSMAN
# ==========================================
class ExchangeRateCreate(BaseModel):
    rate_date: date
    currency_code: str = Field(pattern=r"^(TRY|EUR|USD)$")
    rate_to_try: Decimal = Field(gt=0)
    source: str = "manual"
    note: str | None = None


@router.get("/exchange-rates")
def list_exchange_rates(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("valuation.view")),
):
    rows = db.scalars(
        select(ExchangeRate)
        .where(ExchangeRate.tenant_id == me.tenant_id, ExchangeRate.is_deleted.is_(False))
        .order_by(ExchangeRate.rate_date.desc(), ExchangeRate.currency_code)
    ).all()
    return [
        {
            "id": r.id,
            "rate_date": r.rate_date,
            "currency_code": r.currency_code,
            "rate_to_try": float(r.rate_to_try),
            "source": r.source,
            "note": r.note,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


@router.post("/exchange-rates", status_code=201)
def upsert_exchange_rate(
    body: ExchangeRateCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("valuation.update")),
):
    existing = db.scalar(
        select(ExchangeRate).where(
            ExchangeRate.tenant_id == me.tenant_id,
            ExchangeRate.rate_date == body.rate_date,
            ExchangeRate.currency_code == body.currency_code,
        )
    )
    if existing:
        old_val = str(existing.rate_to_try)
        existing.rate_to_try = body.rate_to_try
        existing.source = body.source
        existing.note = body.note
        rec = existing
    else:
        old_val = None
        rec = ExchangeRate(
            tenant_id=me.tenant_id,
            rate_date=body.rate_date,
            currency_code=body.currency_code,
            rate_to_try=body.rate_to_try,
            source=body.source,
            note=body.note,
        )
        db.add(rec)
        db.flush()

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="exchange_rate.upsert",
        entity="exchange_rate",
        entity_id=rec.id,
        old={"rate_to_try": old_val} if old_val else None,
        new={"currency": body.currency_code, "rate_to_try": str(body.rate_to_try), "date": str(body.rate_date)},
        ip=client_ip(request),
    )
    db.commit()
    return {"id": rec.id, "currency_code": rec.currency_code, "rate_to_try": float(rec.rate_to_try)}


@router.post("/exchange-rates/fetch-live")
def fetch_live_exchange_rates(
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("setting.manage")),
):
    """
    Canlı piyasa döviz kurlarını (USD ve EUR) otomatik çeker ve sisteme kaydeder.
    """
    import json
    import urllib.request
    from datetime import date

    today = date.today()
    live_data: dict[str, float] = {}
    source_name = "online_rates"

    try:
        req = urllib.request.Request(
            "https://open.er-api.com/v6/latest/USD",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )
        with urllib.request.urlopen(req, timeout=5) as res:
            d = json.loads(res.read().decode())
            usd = round(float(d["rates"]["TRY"]), 4)
            eur = round(usd / float(d["rates"]["EUR"]), 4)
            live_data = {"USD": usd, "EUR": eur}
            source_name = "open.er-api.com"
    except Exception:
        try:
            req = urllib.request.Request(
                "https://api.exchangerate-api.com/v4/latest/USD",
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            )
            with urllib.request.urlopen(req, timeout=5) as res:
                d = json.loads(res.read().decode())
                usd = round(float(d["rates"]["TRY"]), 4)
                eur = round(usd / float(d["rates"]["EUR"]), 4)
                live_data = {"USD": usd, "EUR": eur}
                source_name = "exchangerate-api.com"
        except Exception as e:
            raise HTTPException(502, f"Canlı kur servisine ulaşılamadı: {e}")

    saved: dict[str, float] = {}
    for code, rate_val in live_data.items():
        existing = db.scalar(
            select(ExchangeRate).where(
                ExchangeRate.tenant_id == me.tenant_id,
                ExchangeRate.rate_date == today,
                ExchangeRate.currency_code == code,
            )
        )
        dec_val = Decimal(str(rate_val))
        if existing:
            existing.rate_to_try = dec_val
            existing.source = "auto"
            existing.note = f"Otomatik çekildi ({source_name})"
        else:
            rec = ExchangeRate(
                tenant_id=me.tenant_id,
                rate_date=today,
                currency_code=code,
                rate_to_try=dec_val,
                source="auto",
                note=f"Otomatik çekildi ({source_name})",
            )
            db.add(rec)
        saved[code] = rate_val

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="exchange_rate.fetch_live",
        entity="exchange_rate",
        new={"rates": saved, "source": source_name, "date": str(today)},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True, "date": str(today), "source": source_name, "rates": saved}


class ValuationCreate(BaseModel):
    product_id: uuid.UUID
    asset_id: uuid.UUID | None = None
    condition: str = "excellent"
    market_value: Decimal = Field(ge=0)
    currency: str = Field(default="TRY", pattern=r"^(TRY|EUR|USD)$")
    valuation_source: str = Field(min_length=2, max_length=150)
    valuation_date: date | None = None
    note: str | None = None
    auto_approve: bool = True


@router.get("/valuations")
def list_valuations(
    product_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("valuation.view")),
):
    q = select(Valuation).where(Valuation.tenant_id == me.tenant_id)
    if product_id:
        q = q.where(Valuation.product_id == product_id)
    rows = db.scalars(q.order_by(Valuation.valuation_date.desc(), Valuation.created_at.desc())).all()
    return [
        {
            "id": v.id,
            "product_id": v.product_id,
            "product_name": v.product.name if v.product else "",
            "inventory_code": v.asset.inventory_code if v.asset else (v.product.inventory_code if v.product else ""),
            "asset_id": v.asset_id,
            "serial_number": v.asset.serial_number if v.asset else None,
            "brand_name": v.brand_name,
            "model_name": v.model_name,
            "condition": v.condition,
            "market_value": float(v.market_value),
            "currency": v.currency,
            "valuation_source": v.valuation_source,
            "valuation_date": v.valuation_date,
            "status": v.status,
            "note": v.note,
            "created_at": v.created_at,
        }
        for v in rows
    ]


@router.get("/valuations/research")
def research_market_value(
    product_id: uuid.UUID,
    condition: str = "excellent",
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("valuation.view")),
):
    """
    Otomatik değerleme araştırma altyapısı:
    Güvenilir bir fiyat kaynağı (onaylı geçmiş değerleme referansı) bulunmadığında KESİNLİKLE uydurma değer üretmez!
    """
    prod = db.get(Product, product_id)
    if not prod or prod.tenant_id != me.tenant_id:
        raise HTTPException(404, "Ürün bulunamadı.")

    history = db.scalars(
        select(Valuation)
        .where(
            Valuation.tenant_id == me.tenant_id,
            Valuation.product_id == product_id,
            Valuation.status == "approved",
        )
        .order_by(Valuation.valuation_date.desc())
        .limit(5)
    ).all()

    if not history and prod.model_id:
        history = db.scalars(
            select(Valuation)
            .join(Product, Valuation.product_id == Product.id)
            .where(
                Valuation.tenant_id == me.tenant_id,
                Product.model_id == prod.model_id,
                Valuation.status == "approved",
            )
            .order_by(Valuation.valuation_date.desc())
            .limit(5)
        ).all()

    if history:
        avg_val = sum((h.market_value for h in history), Decimal("0")) / Decimal(str(len(history)))
        return {
            "found_reliable_source": True,
            "message": f"Sistemdeki son {len(history)} onaylı değerleme kaydına dayalı referans bulundu. Onayınız olmadan uygulanmaz.",
            "suggested_value": float(avg_val.quantize(Decimal("0.01"))),
            "currency": history[0].currency,
            "source": f"Geçmiş Onaylı Değerleme Ortalaması ({history[0].valuation_source})",
            "condition": condition,
        }

    if prod.current_market_value is not None and prod.current_market_value > 0:
        return {
            "found_reliable_source": True,
            "message": "Ürün kartında tanımlı güncel ikinci el piyasa değeri referans olarak çekildi. Onayınız olmadan uygulanmaz.",
            "suggested_value": float(prod.current_market_value),
            "currency": prod.market_value_currency or "TRY",
            "source": "Ürün Kartı Güncel Piyasa Değeri Kaydı",
            "condition": condition,
        }

    return {
        "found_reliable_source": False,
        "message": "Bu marka/model için doğrulanmış güvenilir ikinci el fiyat kaynağı bulunamadı. Sistem kuralı gereği uydurma değer üretilmez; lütfen piyasa araştırması sonucunu manuel girin.",
        "suggested_value": None,
    }


@router.post("/valuations", status_code=201)
def create_valuation(
    body: ValuationCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("valuation.update")),
):
    prod = db.get(Product, body.product_id)
    if not prod or prod.tenant_id != me.tenant_id:
        raise HTTPException(404, "Ürün bulunamadı.")
    asset = db.get(Asset, body.asset_id) if body.asset_id else None

    vdate = body.valuation_date or date.today()
    can_approve = body.auto_approve and has_permission(me, "valuation.approve")
    status_val = "approved" if can_approve else "proposed"

    val = Valuation(
        tenant_id=me.tenant_id,
        product_id=prod.id,
        asset_id=asset.id if asset else None,
        brand_name=prod.brand.name if prod.brand else None,
        model_name=prod.model.name if prod.model else None,
        condition=body.condition,
        market_value=body.market_value,
        currency=body.currency,
        valuation_source=body.valuation_source,
        valuation_date=vdate,
        note=body.note,
        status=status_val,
        created_by=me.id,
        approved_by=me.id if can_approve else None,
        approved_at=datetime.now(timezone.utc) if can_approve else None,
    )
    db.add(val)

    # Yalnızca onaylanmışsa ürünün/varlığın güncel piyasa değerini güncelle
    if can_approve:
        if asset:
            asset.current_market_value = body.market_value
            asset.market_value_currency = body.currency
            asset.last_valuation_date = vdate
        else:
            prod.current_market_value = body.market_value
            prod.market_value_currency = body.currency
            prod.last_valuation_date = vdate
            for a in db.scalars(
                select(Asset).where(
                    Asset.tenant_id == me.tenant_id,
                    Asset.product_id == prod.id,
                    Asset.is_deleted.is_(False),
                )
            ):
                a.current_market_value = body.market_value
                a.market_value_currency = body.currency
                a.last_valuation_date = vdate

    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="valuation.create",
        entity="valuation",
        entity_id=val.id,
        new={
            "product": prod.name,
            "market_value": str(body.market_value),
            "currency": body.currency,
            "status": status_val,
        },
        ip=client_ip(request),
    )
    db.commit()
    return {"id": val.id, "status": val.status}


@router.post("/valuations/{valuation_id}/approve")
def approve_proposed_valuation(
    valuation_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("valuation.approve")),
):
    """Önerilen (proposed) piyasa değerlemesini kullanıcı onayıyla ürüne uygular."""
    val = db.get(Valuation, valuation_id)
    if not val or val.tenant_id != me.tenant_id:
        raise HTTPException(404, "Değerleme kaydı bulunamadı.")
    val.status = "approved"
    val.approved_by = me.id
    val.approved_at = datetime.now(timezone.utc)

    if val.asset:
        val.asset.current_market_value = val.market_value
        val.asset.market_value_currency = val.currency
        val.asset.last_valuation_date = val.valuation_date
    elif val.product:
        val.product.current_market_value = val.market_value
        val.product.market_value_currency = val.currency
        val.product.last_valuation_date = val.valuation_date
        for a in db.scalars(
            select(Asset).where(
                Asset.tenant_id == me.tenant_id,
                Asset.product_id == val.product.id,
                Asset.is_deleted.is_(False),
            )
        ):
            a.current_market_value = val.market_value
            a.market_value_currency = val.currency
            a.last_valuation_date = val.valuation_date

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="valuation.approve",
        entity="valuation",
        entity_id=val.id,
        new={"market_value": str(val.market_value), "currency": val.currency},
        ip=client_ip(request),
    )
    db.commit()
    return {"id": val.id, "status": "approved"}


class PurchaseCorrectionIn(BaseModel):
    product_id: uuid.UUID
    asset_id: uuid.UUID | None = None
    purchase_date: date
    unit_price: Decimal = Field(ge=0)
    currency: str = Field(default="TRY", pattern=r"^(TRY|EUR|USD)$")
    vat_rate: Decimal = Decimal("20.00")
    invoice_no: str | None = None
    reason: str = Field(min_length=3, max_length=500)


@router.post("/purchase-records/correction", status_code=201)
def create_purchase_cost_correction(
    body: PurchaseCorrectionIn,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("valuation.approve")),
):
    """Alış maliyeti doğrudan silinmez/ezilmez; denetim iziyle yeni düzeltme kaydı oluşturulur."""
    prod = db.get(Product, body.product_id)
    if not prod or prod.tenant_id != me.tenant_id:
        raise HTTPException(404, "Ürün bulunamadı.")
    asset = db.get(Asset, body.asset_id) if body.asset_id else None

    old_price = str(asset.purchase_price if asset else prod.purchase_price)
    prev_rec = db.scalar(
        select(PurchaseRecord)
        .where(PurchaseRecord.tenant_id == me.tenant_id, PurchaseRecord.product_id == prod.id)
        .order_by(PurchaseRecord.created_at.desc())
    )

    rec = PurchaseRecord(
        tenant_id=me.tenant_id,
        product_id=prod.id,
        asset_id=asset.id if asset else None,
        purchase_date=body.purchase_date,
        unit_price=body.unit_price,
        currency=body.currency,
        vat_rate=body.vat_rate,
        invoice_no=body.invoice_no,
        correction_of_id=prev_rec.id if prev_rec else None,
        reason=body.reason,
        created_by=me.id,
    )
    db.add(rec)
    if asset:
        asset.purchase_price = body.unit_price
        asset.purchase_currency = body.currency
        asset.purchase_date = body.purchase_date
    else:
        prod.purchase_price = body.unit_price
        prod.purchase_currency = body.currency
        prod.purchase_date = body.purchase_date

    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="purchase_cost.correction",
        entity="purchase_record",
        entity_id=rec.id,
        old={"unit_price": old_price},
        new={"unit_price": str(body.unit_price), "currency": body.currency, "reason": body.reason},
        ip=client_ip(request),
    )
    db.commit()
    return {"id": rec.id, "new_unit_price": float(body.unit_price)}


@router.get("/finance/three-values")
def list_three_values_comparison(
    reporting_currency: str = Query(default="TRY", pattern=r"^(TRY|EUR|USD)$"),
    useful_life_years: int = Query(default=5, ge=1, le=25),
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("valuation.view")),
):
    """
    Ürünün 3 farklı değerini birbirinden ayırarak ve seçilen raporlama para birimine çevirerek döner:
    1. Alış Maliyeti
    2. Güncel İkinci El Piyasa Değeri
    3. Muhasebesel Net Defter Değeri (Amortisman düşülmüş)
    """
    rates = get_latest_rates(db, me.tenant_id)
    target_rate = rates.get(reporting_currency, Decimal("1.0"))
    today_year = date.today().year

    products = db.scalars(
        select(Product).where(Product.tenant_id == me.tenant_id, Product.is_deleted.is_(False))
    ).all()

    items = []
    total_purchase_rep = Decimal("0")
    total_market_rep = Decimal("0")
    total_nbv_rep = Decimal("0")

    for p in products:
        qty = p.quantity if p.quantity > 0 else Decimal("1")
        unit_cost = p.purchase_price or Decimal("0")
        unit_mkt = p.current_market_value if p.current_market_value is not None else unit_cost
        p_year = p.purchase_date.year if p.purchase_date else today_year
        age_years = max(0, min(useful_life_years, today_year - p_year))
        dep_ratio = Decimal(str(age_years)) / Decimal(str(useful_life_years))
        unit_nbv = max(Decimal("0"), unit_cost * (Decimal("1") - dep_ratio))

        cost_try = to_try(unit_cost * qty, p.purchase_currency, rates)
        mkt_try = to_try(unit_mkt * qty, p.market_value_currency, rates)
        nbv_try = to_try(unit_nbv * qty, p.purchase_currency, rates)

        cost_rep = cost_try / target_rate
        mkt_rep = mkt_try / target_rate
        nbv_rep = nbv_try / target_rate

        total_purchase_rep += cost_rep
        total_market_rep += mkt_rep
        total_nbv_rep += nbv_rep

        items.append(
            {
                "product_id": p.id,
                "inventory_code": p.inventory_code,
                "name": p.name,
                "category_name": p.category.name if p.category else "",
                "quantity": float(qty),
                "unit": p.unit,
                "original_purchase_cost": float(unit_cost * qty),
                "purchase_currency": p.purchase_currency,
                "original_market_value": float(unit_mkt * qty),
                "market_currency": p.market_value_currency,
                "purchase_cost_converted": round(float(cost_rep), 2),
                "market_value_converted": round(float(mkt_rep), 2),
                "net_book_value_converted": round(float(nbv_rep), 2),
                "age_years": age_years,
            }
        )

    return {
        "reporting_currency": reporting_currency,
        "exchange_rates_to_try": {k: float(v) for k, v in rates.items()},
        "totals": {
            "purchase_cost": round(float(total_purchase_rep), 2),
            "market_value": round(float(total_market_rep), 2),
            "net_book_value": round(float(total_nbv_rep), 2),
        },
        "items": items,
    }


# ==========================================
# 2. PHASE 6: DEPO SAYIM MODÜLÜ (STOCKTAKE)
# ==========================================
class StocktakeCreateIn(BaseModel):
    warehouse_id: uuid.UUID
    count_date: date | None = None
    note: str | None = None


class StocktakeScanIn(BaseModel):
    serial_or_qr: str = Field(min_length=1, max_length=120)


def _to_stocktake_out(st: Stocktake) -> dict:
    summary = {"found": 0, "missing": 0, "extra": 0, "wrong_location": 0, "serial_mismatch": 0}
    for it in st.items:
        if it.result in summary:
            summary[it.result] += 1
    return {
        "id": st.id,
        "stocktake_no": st.stocktake_no,
        "warehouse_id": st.warehouse_id,
        "warehouse_name": st.warehouse.name if st.warehouse else "",
        "count_date": st.count_date,
        "responsible_name": st.responsible.full_name if st.responsible else "",
        "status": st.status,
        "note": st.note,
        "summary": summary,
        "items": [
            {
                "id": i.id,
                "product_id": i.product_id,
                "product_name": i.product.name if i.product else "Bilinmeyen Cihaz",
                "inventory_code": i.asset.inventory_code
                if i.asset
                else (i.product.inventory_code if i.product else "—"),
                "asset_id": i.asset_id,
                "serial_number": i.asset.serial_number if i.asset else i.scanned_serial_or_qr,
                "expected_warehouse_name": i.expected_warehouse_name,
                "found_warehouse_name": i.found_warehouse_name,
                "expected_qty": float(i.expected_qty),
                "counted_qty": float(i.counted_qty),
                "result": i.result,
                "note": i.note,
            }
            for i in st.items
        ],
    }


@router.get("/stocktakes")
def list_stocktakes(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("stocktake.view")),
):
    rows = db.scalars(
        select(Stocktake)
        .where(Stocktake.tenant_id == me.tenant_id, Stocktake.is_deleted.is_(False))
        .order_by(Stocktake.created_at.desc())
    ).all()
    return [_to_stocktake_out(r) for r in rows]


@router.post("/stocktakes", status_code=201)
def start_stocktake(
    body: StocktakeCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("stocktake.perform")),
):
    wh = db.get(Warehouse, body.warehouse_id)
    if not wh or wh.tenant_id != me.tenant_id or wh.is_deleted:
        raise HTTPException(404, "Depo bulunamadı.")

    # Seçilen depoda sistemde kayıtlı olan tüm seri numaralı cihazları 'missing' (henüz okutulmadı) olarak listeye ekle
    expected_assets = db.scalars(
        select(Asset).where(
            Asset.tenant_id == me.tenant_id,
            Asset.is_deleted.is_(False),
            Asset.warehouse_name == wh.name,
        )
    ).all()

    st = Stocktake(
        tenant_id=me.tenant_id,
        stocktake_no=_next_no(db, Stocktake, Stocktake.stocktake_no, "CNT"),
        warehouse_id=wh.id,
        count_date=body.count_date or date.today(),
        responsible_user_id=me.id,
        status="counting",
        note=body.note,
        items=[
            StocktakeItem(
                product_id=a.product_id,
                asset_id=a.id,
                scanned_serial_or_qr=a.serial_number,
                expected_warehouse_name=wh.name,
                found_warehouse_name=None,
                expected_qty=Decimal("1"),
                counted_qty=Decimal("0"),
                result="missing",
            )
            for a in expected_assets
        ],
    )
    db.add(st)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="stocktake.start",
        entity="stocktake",
        entity_id=st.id,
        new={"stocktake_no": st.stocktake_no, "warehouse": wh.name, "expected_items": len(expected_assets)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(st)
    return _to_stocktake_out(st)


@router.post("/stocktakes/{stocktake_id}/scan")
def scan_stocktake_item(
    stocktake_id: uuid.UUID,
    body: StocktakeScanIn,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("stocktake.perform")),
):
    """QR token, envanter kodu veya seri numarası okutularak sayım kalemini işler."""
    st = db.get(Stocktake, stocktake_id)
    if not st or st.tenant_id != me.tenant_id or st.is_deleted:
        raise HTTPException(404, "Sayım oturumu bulunamadı.")
    if st.status != "counting":
        raise HTTPException(400, "Bu sayım oturumu tamamlanmış veya kapatılmış.")

    code = body.serial_or_qr.strip()
    if "/q/" in code:
        code = code.split("/q/")[-1].strip()

    # 1. Beklenen kalemler arasında mı?
    for it in st.items:
        if it.asset and (
            it.asset.serial_number.lower() == code.lower()
            or it.asset.qr_token == code
            or it.asset.inventory_code.lower() == code.lower()
        ):
            it.counted_qty = Decimal("1")
            it.found_warehouse_name = st.warehouse.name
            it.result = "found"
            db.commit()
            db.refresh(st)
            return _to_stocktake_out(st)

    # 2. Başka bir depoya kayıtlı bir cihaz mı? (Yanlış lokasyon - wrong_location)
    other_asset = db.scalar(
        select(Asset).where(
            Asset.tenant_id == me.tenant_id,
            Asset.is_deleted.is_(False),
            (func.lower(Asset.serial_number) == code.lower())
            | (Asset.qr_token == code)
            | (func.lower(Asset.inventory_code) == code.lower()),
        )
    )
    if other_asset:
        st.items.append(
            StocktakeItem(
                product_id=other_asset.product_id,
                asset_id=other_asset.id,
                scanned_serial_or_qr=other_asset.serial_number,
                expected_warehouse_name=other_asset.warehouse_name or "Başka Lokasyon",
                found_warehouse_name=st.warehouse.name,
                expected_qty=Decimal("0"),
                counted_qty=Decimal("1"),
                result="wrong_location",
                note=f"Sistemde '{other_asset.warehouse_name}' lokasyonunda görünüyordu.",
            )
        )
    else:
        # 3. Sistemde hiç kayıtlı olmayan seri numarası (Fazla / Seri numarası uyuşmazlığı)
        st.items.append(
            StocktakeItem(
                product_id=None,
                asset_id=None,
                scanned_serial_or_qr=code,
                expected_warehouse_name=None,
                found_warehouse_name=st.warehouse.name,
                expected_qty=Decimal("0"),
                counted_qty=Decimal("1"),
                result="serial_mismatch",
                note="Sistemde bu seri numarası / QR kod kayıtlı değil (Fazla / Uyuşmazlık).",
            )
        )

    db.commit()
    db.refresh(st)
    return _to_stocktake_out(st)


class StocktakeUpdateIn(BaseModel):
    count_date: date | None = None
    note: str | None = None


@router.patch("/stocktakes/{stocktake_id}")
def update_stocktake(
    stocktake_id: uuid.UUID,
    body: StocktakeUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("stocktake.perform")),
):
    st = db.get(Stocktake, stocktake_id)
    if not st or st.tenant_id != me.tenant_id or st.is_deleted:
        raise HTTPException(404, "Sayım oturumu bulunamadı.")
    if body.count_date is not None:
        st.count_date = body.count_date
    if body.note is not None:
        st.note = body.note
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="stocktake.update",
        entity="stocktake",
        entity_id=st.id,
        new={"note": st.note, "count_date": str(st.count_date)},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(st)
    return _to_stocktake_out(st)


@router.delete("/stocktakes/{stocktake_id}")
def delete_stocktake(
    stocktake_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("stocktake.perform")),
):
    st = db.get(Stocktake, stocktake_id)
    if not st or st.tenant_id != me.tenant_id or st.is_deleted:
        raise HTTPException(404, "Sayım oturumu bulunamadı.")
    st.is_deleted = True
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="stocktake.delete",
        entity="stocktake",
        entity_id=st.id,
        old={"stocktake_no": st.stocktake_no},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True}


class StocktakeItemUpdateIn(BaseModel):
    result: str | None = None
    counted_qty: Decimal | None = None
    note: str | None = None


@router.patch("/stocktakes/{stocktake_id}/items/{item_id}")
def update_stocktake_item(
    stocktake_id: uuid.UUID,
    item_id: uuid.UUID,
    body: StocktakeItemUpdateIn,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("stocktake.perform")),
):
    st = db.get(Stocktake, stocktake_id)
    if not st or st.tenant_id != me.tenant_id or st.is_deleted:
        raise HTTPException(404, "Sayım oturumu bulunamadı.")
    it = db.get(StocktakeItem, item_id)
    if not it or it.stocktake_id != st.id:
        raise HTTPException(404, "Sayım kalemi bulunamadı.")
    if body.result is not None:
        it.result = body.result
        if body.result == "found":
            it.counted_qty = Decimal("1")
            it.found_warehouse_name = st.warehouse.name if st.warehouse else None
        elif body.result == "missing":
            it.counted_qty = Decimal("0")
            it.found_warehouse_name = None
    if body.counted_qty is not None:
        it.counted_qty = body.counted_qty
    if body.note is not None:
        it.note = body.note
    db.commit()
    db.refresh(st)
    return _to_stocktake_out(st)


@router.delete("/stocktakes/{stocktake_id}/items/{item_id}")
def delete_stocktake_item(
    stocktake_id: uuid.UUID,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("stocktake.perform")),
):
    st = db.get(Stocktake, stocktake_id)
    if not st or st.tenant_id != me.tenant_id or st.is_deleted:
        raise HTTPException(404, "Sayım oturumu bulunamadı.")
    it = db.get(StocktakeItem, item_id)
    if not it or it.stocktake_id != st.id:
        raise HTTPException(404, "Sayım kalemi bulunamadı.")
    db.delete(it)
    db.commit()
    db.refresh(st)
    return _to_stocktake_out(st)


@router.post("/stocktakes/{stocktake_id}/approve")
def approve_stocktake(
    stocktake_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("stocktake.approve")),
):
    """Sayımı onaylar ve yanlış lokasyondaki cihazların lokasyonunu sayım deposuna düzeltir."""
    st = db.get(Stocktake, stocktake_id)
    if not st or st.tenant_id != me.tenant_id or st.is_deleted:
        raise HTTPException(404, "Sayım oturumu bulunamadı.")
    if st.status == "approved":
        raise HTTPException(400, "Bu sayım zaten onaylanmış.")

    adj_count = 0
    for it in st.items:
        if it.result == "wrong_location" and it.asset:
            prev_wh = it.asset.warehouse_name
            it.asset.warehouse_name = st.warehouse.name
            adj_count += 1
            db.add(
                StockMovement(
                    tenant_id=me.tenant_id,
                    movement_no=_next_no(db, StockMovement, StockMovement.movement_no, "MOV"),
                    movement_type="count_diff",
                    to_warehouse_id=st.warehouse_id,
                    performed_by=me.id,
                    note=f"[{st.stocktake_no} SAYIM ONAYI] Lokasyon düzeltmesi",
                    items=[
                        StockMovementItem(
                            product_id=it.asset.product_id,
                            asset_id=it.asset.id,
                            quantity=Decimal("1"),
                            previous_location_text=prev_wh,
                            new_location_text=st.warehouse.name,
                        )
                    ],
                )
            )

    st.status = "approved"
    db.add(
        StocktakeApproval(
            stocktake_id=st.id,
            approved_by_user_id=me.id,
            adjustments_created=adj_count,
            note="Yetkili kullanıcı tarafından sayım onaylandı.",
        )
    )
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="stocktake.approve",
        entity="stocktake",
        entity_id=st.id,
        new={"stocktake_no": st.stocktake_no, "adjustments": adj_count},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(st)
    return _to_stocktake_out(st)


# ==========================================
# 3. PHASE 6: 18 PROFESYONEL RAPOR MOTORU (WEB ÖNİZLEME & PDF)
# ==========================================
REPORT_TYPES = [
    {"id": "1_general_inventory", "title": "1. Genel Şirket Envanter Raporu"},
    {"id": "2_total_asset_value", "title": "2. Toplam Varlık Değeri Raporu"},
    {"id": "3_purchase_cost", "title": "3. Alış Maliyeti Raporu"},
    {"id": "4_market_value", "title": "4. Güncel Piyasa Değeri Raporu"},
    {"id": "5_by_category", "title": "5. Kategori Bazlı Envanter Raporu"},
    {"id": "6_by_brand", "title": "6. Marka Bazlı Envanter Raporu"},
    {"id": "7_by_model", "title": "7. Model Bazlı Envanter Raporu"},
    {"id": "8_serial_numbers", "title": "8. Seri Numarası Listesi Raporu"},
    {"id": "9_by_warehouse", "title": "9. Depo Bazlı Envanter Raporu"},
    {"id": "10_by_location", "title": "10. Lokasyon ve Raf Bazlı Rapor"},
    {"id": "11_project_equipment", "title": "11. Proje Bazlı Ekipman Raporu"},
    {"id": "12_employee_assignments", "title": "12. Personel Zimmet Raporu"},
    {"id": "13_service_maintenance", "title": "13. Servis ve Bakım Raporu"},
    {"id": "14_warranty_expiry", "title": "14. Garanti Bitiş Raporu"},
    {"id": "15_software_licenses", "title": "15. Yazılım Lisans Raporu"},
    {"id": "16_stock_movements", "title": "16. Stok Hareket Raporu"},
    {"id": "17_stocktake", "title": "17. Sayım Raporu"},
    {"id": "18_financial_valuation_change", "title": "18. Finansal Değer Değişim Raporu"},
]


def _get_fmt_prefs(db: Session, tenant_id: uuid.UUID) -> tuple[bool, int]:
    """Kullanıcının ayarladığı sıfır gizleme ve ondalık basamak tercihini döner."""
    row = db.scalar(select(Setting).where(Setting.tenant_id == tenant_id, Setting.key == "general"))
    if row and isinstance(row.value, dict):
        trim = bool(row.value.get("trim_trailing_zeros", True))
        try:
            dec = max(0, min(6, int(row.value.get("number_decimals", 0))))
        except (TypeError, ValueError):
            dec = 0
        return trim, dec
    return True, 0


def _fmt_qty(val: Decimal | float | int | None) -> str:
    """Miktarları gereksiz .000 kuyruğu olmadan Türkçe binlik ayraçla biçimlendirir."""
    if val is None:
        return "0"
    d = Decimal(str(val)).normalize()
    s = f"{d:f}"
    if "." in s:
        int_part, dec_part = s.split(".", 1)
        dec_part = dec_part.rstrip("0")
    else:
        int_part, dec_part = s, ""
    try:
        int_formatted = f"{int(int_part):,}".replace(",", ".")
    except ValueError:
        int_formatted = int_part
    return f"{int_formatted},{dec_part}" if dec_part else int_formatted


def _fmt_money(val: Decimal | float | int | None, trim_zeros: bool = True, decimals: int = 0) -> str:
    """Parasal tutarları Türkçe binlik ayraçla ve gereksiz .00 kuyruğu olmadan biçimlendirir."""
    if val is None:
        return "0"
    fval = float(val)
    if trim_zeros:
        rounded = round(fval, 2)
        if abs(rounded - round(rounded)) < 1e-9:
            if decimals <= 0:
                return f"{int(round(rounded)):,}".replace(",", ".")
            return (
                f"{int(round(rounded)):,}".replace(",", ".")
                + ","
                + ("0" * decimals)
            )
        s = f"{rounded:.2f}".rstrip("0").rstrip(".")
        if "." in s:
            ip, dp = s.split(".", 1)
            return f"{int(ip):,}".replace(",", ".") + "," + dp
        return f"{int(s):,}".replace(",", ".")
    fmt_str = f"{fval:,.{max(0, decimals)}f}"
    if "." in fmt_str:
        ip, dp = fmt_str.split(".", 1)
        return ip.replace(",", ".") + "," + dp
    return fmt_str.replace(",", ".")


@router.get("/reports/types")
def get_report_types(me: User = Depends(require_permission("report.view"))):
    return REPORT_TYPES


@router.get("/reports/{report_id}")
def generate_report_data(
    report_id: str,
    request: Request,
    currency: str = Query(default="TRY", pattern=r"^(TRY|EUR|USD)$"),
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("report.view")),
):
    """18 kurumsal raporun tamamı için gerçek veritabanı tablosunu, toplam adedi ve toplam değeri üretir."""
    rates = get_latest_rates(db, me.tenant_id)
    target_rate = rates.get(currency, Decimal("1.0"))
    meta = next((r for r in REPORT_TYPES if r["id"] == report_id), None)
    if not meta:
        raise HTTPException(404, "Rapor türü bulunamadı.")

    trim_zeros, num_decimals = _get_fmt_prefs(db, me.tenant_id)

    products = db.scalars(
        select(Product).where(Product.tenant_id == me.tenant_id, Product.is_deleted.is_(False))
    ).all()
    assets = db.scalars(
        select(Asset).where(Asset.tenant_id == me.tenant_id, Asset.is_deleted.is_(False))
    ).all()

    columns: list[str] = []
    rows: list[list[str]] = []
    total_qty = Decimal("0")
    total_val = Decimal("0")

    if report_id in {"1_general_inventory", "2_total_asset_value", "3_purchase_cost", "4_market_value"}:
        columns = ["Envanter Kodu", "Ürün Adı", "Kategori", "Miktar", "Alış Maliyeti", "Piyasa Değeri", f"Toplam ({currency})"]
        for p in products:
            qty = p.quantity if p.quantity > 0 else Decimal("1")
            total_qty += qty
            c_val = to_try((p.purchase_price or Decimal("0")) * qty, p.purchase_currency, rates) / target_rate
            m_val = (
                to_try(
                    (p.current_market_value if p.current_market_value is not None else (p.purchase_price or Decimal("0")))
                    * qty,
                    p.market_value_currency,
                    rates,
                )
                / target_rate
            )
            chosen = c_val if report_id == "3_purchase_cost" else m_val
            total_val += chosen
            rows.append(
                [
                    p.inventory_code,
                    p.name,
                    p.category.name if p.category else "—",
                    f"{_fmt_qty(qty)} {p.unit}",
                    f"{_fmt_money(p.purchase_price or 0, trim_zeros, num_decimals)} {p.purchase_currency}",
                    f"{_fmt_money(p.current_market_value if p.current_market_value is not None else (p.purchase_price or 0), trim_zeros, num_decimals)} {p.market_value_currency}",
                    f"{_fmt_money(chosen, trim_zeros, num_decimals)} {currency}",
                ]
            )
    elif report_id in {"5_by_category", "6_by_brand", "7_by_model"}:
        columns = ["Grup", "Ürün Adı", "Envanter Kodu", "Miktar", "Konum", f"Değer ({currency})"]
        for p in products:
            grp = (
                (p.category.name if p.category else "Diğer")
                if report_id == "5_by_category"
                else ((p.brand.name if p.brand else "Markasız") if report_id == "6_by_brand" else (p.model.name if p.model else "Modelsiz"))
            )
            qty = p.quantity if p.quantity > 0 else Decimal("1")
            total_qty += qty
            val = to_try((p.purchase_price or Decimal("0")) * qty, p.purchase_currency, rates) / target_rate
            total_val += val
            rows.append(
                [
                    grp,
                    p.name,
                    p.inventory_code,
                    f"{_fmt_qty(qty)} {p.unit}",
                    p.warehouse_name or "—",
                    f"{_fmt_money(val, trim_zeros, num_decimals)} {currency}",
                ]
            )
    elif report_id in {"8_serial_numbers", "9_by_warehouse", "10_by_location", "14_warranty_expiry"}:
        columns = ["Envanter Kodu", "Seri Numarası", "Ürün Adı", "Depo / Raf", "Garanti Bitiş", "Durum", f"Değer ({currency})"]
        for a in assets:
            total_qty += Decimal("1")
            val = to_try(a.purchase_price or Decimal("0"), a.purchase_currency, rates) / target_rate
            total_val += val
            rows.append(
                [
                    a.inventory_code,
                    a.serial_number,
                    a.product.name if a.product else "",
                    f"{a.warehouse_name or '—'} / {a.shelf_section or '—'}",
                    str(a.warranty_end or "—"),
                    a.status,
                    f"{_fmt_money(val, trim_zeros, num_decimals)} {currency}",
                ]
            )
    elif report_id == "11_project_equipment":
        columns = ["Proje Kodu", "Proje Adı", "Ekipman", "Seri No", "Gönderilen", "Kalan", "Durum"]
        p_assets = db.scalars(select(ProjectAsset).where(ProjectAsset.tenant_id == me.tenant_id)).all()
        for pa in p_assets:
            total_qty += pa.quantity
            rows.append(
                [
                    pa.project.code if pa.project else "",
                    pa.project.name if pa.project else "",
                    pa.product.name if pa.product else "",
                    pa.asset.serial_number if pa.asset else "—",
                    _fmt_qty(pa.quantity),
                    _fmt_qty(pa.quantity - pa.returned_quantity),
                    pa.status,
                ]
            )
    elif report_id == "12_employee_assignments":
        columns = ["Fiş No", "Personel", "Ürün", "Seri No", "Teslim Adedi", "Durum", "Tarih"]
        asgs = db.scalars(select(Assignment).where(Assignment.tenant_id == me.tenant_id)).all()
        for asg in asgs:
            for it in asg.items:
                total_qty += it.quantity
                rows.append(
                    [
                        asg.assignment_no,
                        asg.employee.full_name if asg.employee else "",
                        it.product.name if it.product else "",
                        it.asset.serial_number if it.asset else "—",
                        _fmt_qty(it.quantity),
                        "İade Alındı" if it.is_returned else "Zimmette",
                        asg.delivered_at.strftime("%Y-%m-%d"),
                    ]
                )
    elif report_id == "13_service_maintenance":
        columns = ["Servis No", "Ürün / Cihaz", "Arıza Türü", "Servis Firması", "Gönderim", "Sonuç", "Maliyet"]
        srvs = db.scalars(select(ServiceRecord).where(ServiceRecord.tenant_id == me.tenant_id)).all()
        for s in srvs:
            total_qty += Decimal("1")
            val = to_try(s.total_cost, s.currency, rates) / target_rate
            total_val += val
            rows.append(
                [
                    s.service_no,
                    s.product.name if s.product else "",
                    s.fault_type,
                    s.service_company or "—",
                    str(s.sent_date),
                    s.result,
                    f"{_fmt_money(s.total_cost, trim_zeros, num_decimals)} {s.currency}",
                ]
            )
    elif report_id == "15_software_licenses":
        columns = ["Yazılım Adı", "Üretici", "Lisans Türü", "Maskeli Anahtar", "Kullanıcı", "Bitiş Tarihi", "Maliyet"]
        lics = db.scalars(select(SoftwareLicense).where(SoftwareLicense.tenant_id == me.tenant_id)).all()
        for l in lics:
            total_qty += Decimal(str(l.seats_total))
            val = to_try(l.cost, l.currency, rates) / target_rate
            total_val += val
            rows.append(
                [
                    l.software_name,
                    l.vendor,
                    l.license_type,
                    l.key_masked,
                    f"{l.seats_used}/{l.seats_total}",
                    str(l.end_date or "Süresiz"),
                    f"{_fmt_money(l.cost, trim_zeros, num_decimals)} {l.currency}",
                ]
            )
    elif report_id == "16_stock_movements":
        columns = ["Hareket No", "Tarih", "Tür", "Ürün", "Adet", "Önceki → Yeni Konum", "Kullanıcı"]
        movs = db.scalars(
            select(StockMovement).where(StockMovement.tenant_id == me.tenant_id).order_by(StockMovement.occurred_at.desc()).limit(200)
        ).all()
        for m in movs:
            first = m.items[0] if m.items else None
            if first:
                total_qty += first.quantity
            rows.append(
                [
                    m.movement_no,
                    m.occurred_at.strftime("%Y-%m-%d %H:%M"),
                    m.movement_type,
                    first.product.name if first and first.product else "—",
                    _fmt_qty(first.quantity if first else 0),
                    f"{first.previous_location_text or '—'} → {first.new_location_text or '—'}" if first else "—",
                    m.user.full_name if m.user else "",
                ]
            )
    elif report_id == "17_stocktake":
        columns = ["Sayım No", "Depo", "Tarih", "Ürün / Seri No", "Beklenen Lokasyon", "Bulunan Lokasyon", "Sonuç"]
        sts = db.scalars(select(Stocktake).where(Stocktake.tenant_id == me.tenant_id)).all()
        for st in sts:
            for it in st.items:
                total_qty += Decimal("1")
                rows.append(
                    [
                        st.stocktake_no,
                        st.warehouse.name if st.warehouse else "",
                        str(st.count_date),
                        it.scanned_serial_or_qr or "—",
                        it.expected_warehouse_name or "—",
                        it.found_warehouse_name or "—",
                        it.result,
                    ]
                )
    elif report_id == "18_financial_valuation_change":
        columns = ["Tarih", "Ürün", "Kondisyon", "Değerleme Kaynağı", "Piyasa Değeri", "Durum"]
        vals = db.scalars(
            select(Valuation).where(Valuation.tenant_id == me.tenant_id).order_by(Valuation.valuation_date.desc())
        ).all()
        for v in vals:
            total_qty += Decimal("1")
            cval = to_try(v.market_value, v.currency, rates) / target_rate
            total_val += cval
            rows.append(
                [
                    str(v.valuation_date),
                    v.product.name if v.product else "",
                    v.condition,
                    v.valuation_source,
                    f"{_fmt_money(v.market_value, trim_zeros, num_decimals)} {v.currency}",
                    v.status,
                ]
            )

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="report.generate",
        entity="report",
        entity_id=report_id,
        new={"title": meta["title"], "currency": currency, "rows": len(rows)},
        ip=client_ip(request),
    )
    db.commit()

    return {
        "report_id": report_id,
        "title": meta["title"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "reporting_currency": currency,
        "exchange_rate_snapshot": {k: round(float(v), 4) for k, v in rates.items()},
        "columns": columns,
        "rows": rows,
        "total_quantity": float(total_qty),
        "total_value": round(float(total_val), 2),
    }


# ==========================================
# 4. PHASE 7: BİLDİRİM MERKEZİ & YEDEKLEME & AYARLAR
# ==========================================
def _sync_system_notifications(db: Session, tenant_id: uuid.UUID) -> None:
    """Gerçek veritabanı durumuna göre bildirimleri idempotent olarak üretir."""
    existing_keys = set(
        db.scalars(
            select(Notification.dedupe_key).where(
                Notification.tenant_id == tenant_id, Notification.dedupe_key.is_not(None)
            )
        ).all()
    )
    today = date.today()

    # 1. Yaklaşan yazılım lisans bitişleri (30/15/7 gün)
    for lic in db.scalars(
        select(SoftwareLicense).where(SoftwareLicense.tenant_id == tenant_id, SoftwareLicense.is_deleted.is_(False))
    ):
        if lic.end_date:
            rem = (lic.end_date - today).days
            if rem <= 30:
                dkey = f"lic_exp:{lic.id}:{lic.end_date}"
                if dkey not in existing_keys:
                    db.add(
                        Notification(
                            tenant_id=tenant_id,
                            target_permission="license.view",
                            category="license_expiry",
                            severity="critical" if rem <= 7 else "warning",
                            title=f"Lisans Yenileme Uyarısı: {lic.software_name}",
                            body=f"{lic.software_name} lisansının bitiş tarihine {rem} gün kaldı ({lic.end_date}).",
                            link="/lisanslar",
                            dedupe_key=dkey,
                        )
                    )
                    existing_keys.add(dkey)

    # 2. Yaklaşan garanti bitişleri
    for a in db.scalars(select(Asset).where(Asset.tenant_id == tenant_id, Asset.is_deleted.is_(False))):
        if a.warranty_end:
            rem = (a.warranty_end - today).days
            if 0 <= rem <= 30:
                dkey = f"war_exp:{a.id}:{a.warranty_end}"
                if dkey not in existing_keys:
                    db.add(
                        Notification(
                            tenant_id=tenant_id,
                            target_permission="product.view",
                            category="warranty_expiry",
                            severity="warning",
                            title=f"Garanti Bitiş Uyarısı: {a.serial_number}",
                            body=f"{a.inventory_code} ({a.serial_number}) cihazının garantisi {rem} gün içinde sona eriyor.",
                            link="/envanter",
                            dedupe_key=dkey,
                        )
                    )
                    existing_keys.add(dkey)

    # 3. Kritik stok seviyesi altında kalan ürünler
    for p in db.scalars(
        select(Product).where(
            Product.tenant_id == tenant_id,
            Product.is_deleted.is_(False),
            Product.tracking_type == "quantity",
        )
    ):
        if p.min_stock > 0 and p.quantity <= p.min_stock:
            dkey = f"low_stock:{p.id}:{_fmt_qty(p.quantity)}"
            if dkey not in existing_keys:
                db.add(
                    Notification(
                        tenant_id=tenant_id,
                        target_permission="product.view",
                        category="low_stock",
                        severity="warning",
                        title=f"Kritik Stok Uyarısı: {p.name}",
                        body=f"{p.name} mevcut miktarı ({_fmt_qty(p.quantity)} {p.unit}), kritik sınırın ({_fmt_qty(p.min_stock)}) altındadır.",
                        link="/envanter",
                        dedupe_key=dkey,
                    )
                )
                existing_keys.add(dkey)

    # 4. Serviste bekleyen cihazlar
    for sr in db.scalars(
        select(ServiceRecord).where(
            ServiceRecord.tenant_id == tenant_id,
            ServiceRecord.result == "in_service",
            ServiceRecord.is_deleted.is_(False),
        )
    ):
        dkey = f"srv_active:{sr.id}"
        if dkey not in existing_keys:
            db.add(
                Notification(
                    tenant_id=tenant_id,
                    target_permission="maintenance.view",
                    category="service_delay",
                    severity="info",
                    title=f"Servisteki Cihaz: {sr.service_no}",
                    body=f"{sr.fault_type} nedeniyle serviste bulunan kaydın dönüş takibini kontrol edin.",
                    link="/bakim",
                    dedupe_key=dkey,
                )
            )
            existing_keys.add(dkey)

    db.commit()


@router.get("/notifications")
def list_notifications(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("notification.view")),
):
    _sync_system_notifications(db, me.tenant_id)
    rows = db.scalars(
        select(Notification)
        .where(Notification.tenant_id == me.tenant_id, Notification.is_deleted.is_(False))
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .limit(100)
    ).all()
    filtered = [
        r
        for r in rows
        if (r.user_id is None or r.user_id == me.id)
        and (r.target_permission is None or has_permission(me, r.target_permission))
    ]
    return [
        {
            "id": n.id,
            "category": n.category,
            "severity": n.severity,
            "title": n.title,
            "body": n.body,
            "link": n.link,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in filtered
    ]


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("notification.view")),
):
    n = db.get(Notification, notification_id)
    if not n or n.tenant_id != me.tenant_id:
        raise HTTPException(404, "Bildirim bulunamadı.")
    n.is_read = True
    n.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("notification.view")),
):
    now = datetime.now(timezone.utc)
    for n in db.scalars(
        select(Notification).where(Notification.tenant_id == me.tenant_id, Notification.is_read.is_(False))
    ):
        n.is_read = True
        n.read_at = now
    db.commit()
    return {"ok": True}


# --- YEDEKLEME VE GERİ YÜKLEME ---
@router.get("/backups")
def list_backups(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("backup.view")),
):
    rows = db.scalars(
        select(BackupRecord)
        .where(BackupRecord.tenant_id == me.tenant_id, BackupRecord.is_deleted.is_(False))
        .order_by(BackupRecord.created_at.desc())
    ).all()
    return [
        {
            "id": b.id,
            "backup_no": b.backup_no,
            "backup_type": b.backup_type,
            "file_path": b.file_path,
            "size_bytes": b.size_bytes,
            "sha256": b.sha256,
            "included_uploads": b.included_uploads,
            "status": b.status,
            "created_at": b.created_at,
        }
        for b in rows
    ]


@router.post("/backups/run", status_code=201)
def run_manual_backup(
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("backup.manage")),
):
    """Veritabanı anlık görüntüsünü (JSON dump) ve yüklenen görsel/belgeleri ZIP arşivi olarak yedekler."""
    s = get_settings()
    backup_dir = Path(s.upload_dir).parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    bno = _next_no(db, BackupRecord, BackupRecord.backup_no, "BKP")
    zip_path = backup_dir / f"{bno}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"

    snapshot = {
        "backup_no": bno,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "products_count": db.scalar(select(func.count(Product.id)).where(Product.tenant_id == me.tenant_id)) or 0,
        "assets_count": db.scalar(select(func.count(Asset.id)).where(Asset.tenant_id == me.tenant_id)) or 0,
        "movements_count": db.scalar(
            select(func.count(StockMovement.id)).where(StockMovement.tenant_id == me.tenant_id)
        )
        or 0,
    }

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("database_snapshot.json", json.dumps(snapshot, indent=2))
        up_dir = Path(s.upload_dir)
        if up_dir.exists():
            for root, _, files in os.walk(up_dir):
                for file in files:
                    full = Path(root) / file
                    zf.write(full, arcname=f"uploads/{full.relative_to(up_dir)}")

    raw_bytes = zip_path.read_bytes()
    sha = hashlib.sha256(raw_bytes).hexdigest()

    rec = BackupRecord(
        tenant_id=me.tenant_id,
        backup_no=bno,
        backup_type="manual",
        file_path=str(zip_path),
        size_bytes=len(raw_bytes),
        sha256=sha,
        included_uploads=True,
        status="completed",
        created_by_user_id=me.id,
    )
    db.add(rec)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="backup.create",
        entity="backup_record",
        entity_id=rec.id,
        new={"backup_no": bno, "size_bytes": len(raw_bytes), "sha256": sha},
        ip=client_ip(request),
    )
    db.commit()
    return {
        "id": rec.id,
        "backup_no": rec.backup_no,
        "size_bytes": rec.size_bytes,
        "sha256": rec.sha256,
        "status": rec.status,
    }


@router.post("/backups/{backup_id}/verify")
def verify_backup_integrity(
    backup_id: uuid.UUID,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("backup.manage")),
):
    b = db.get(BackupRecord, backup_id)
    if not b or b.tenant_id != me.tenant_id:
        raise HTTPException(404, "Yedek kaydı bulunamadı.")
    p = Path(b.file_path)
    if not p.is_file():
        raise HTTPException(404, "Yedek arşiv dosyası diskte bulunamadı.")
    current_sha = hashlib.sha256(p.read_bytes()).hexdigest()
    valid = current_sha == b.sha256
    return {"id": b.id, "backup_no": b.backup_no, "integrity_ok": valid, "sha256": current_sha}

@router.post("/backups/open-folder")
def open_backup_folder_in_os(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("backup.view")),
):
    """Sunucuda Windows Dosya Gezgini'ni doğrudan yedek klasöründe açar."""
    import subprocess
    import platform
    s = get_settings()
    bdir = (Path(s.upload_dir).parent / "backups").resolve()
    bdir.mkdir(parents=True, exist_ok=True)
    
    try:
        if platform.system() == "Windows":
            os.startfile(str(bdir))
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(bdir)])
        else:
            subprocess.Popen(["xdg-open", str(bdir)])
        return {"opened": True, "path": str(bdir)}
    except Exception as e:
        return {"opened": False, "path": str(bdir), "error": str(e)}


# --- SİSTEM AYARLARI ---
class SettingsUpdateIn(BaseModel):
    company_name: str = "KÜP Prodüksiyon"
    logo_url: str | None = None
    default_reporting_currency: str = "TRY"
    auto_backup_enabled: bool = True
    auto_backup_time: str = "02:00"
    lan_domain: str = "http://inventory.local"
    number_decimals: int = 0
    trim_trailing_zeros: bool = True
    code_padding_digits: int = 2
    code_prefix: str = "KUP"


@router.get("/settings")
def get_system_settings(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("setting.view")),
):
    row = db.scalar(
        select(Setting).where(Setting.tenant_id == me.tenant_id, Setting.key == "general")
    )
    default_cfg = SettingsUpdateIn().model_dump()
    if row and row.value:
        default_cfg.update(row.value)
    return default_cfg


@router.put("/settings")
def update_system_settings(
    body: SettingsUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("setting.manage")),
):
    row = db.scalar(
        select(Setting).where(Setting.tenant_id == me.tenant_id, Setting.key == "general")
    )
    if not row:
        row = Setting(tenant_id=me.tenant_id, key="general", value=body.model_dump())
        db.add(row)
    else:
        row.value = body.model_dump()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="settings.update",
        entity="setting",
        new=body.model_dump(),
        ip=client_ip(request),
    )
    db.commit()
    return row.value


# ==========================================
# 5. PHASE 8: UYGULAMA LİSANSLAMA SİSTEMİ
# ==========================================
class AppLicenseActivateIn(BaseModel):
    customer_name: str = Field(min_length=2, max_length=180)
    edition: str = "Enterprise"
    license_key: str = Field(min_length=8, max_length=120)
    max_users: int = Field(default=100, ge=1)
    max_assets: int = Field(default=50000, ge=100)
    duration_years: int = Field(default=1, ge=0, le=10, description="0 ise süresiz, 1-10 yıl süreli")


class AppLicenseGenerateIn(BaseModel):
    customer_name: str = Field(min_length=2, max_length=180)
    edition: str = "Enterprise"
    duration_years: int = Field(default=1, ge=0, le=10, description="0: Süresiz, 1: 1 Yıl, 2: 2 Yıl, vb.")
    max_users: int = Field(default=100, ge=1)
    max_assets: int = Field(default=50000, ge=100)


@router.post("/app-license/generate")
def generate_app_license_key(
    body: AppLicenseGenerateIn,
    me: User = Depends(require_permission("app_license.manage")),
):
    """
    Kullanıcının başka bir kuruluşa veya bu sisteme vermek üzere
    1 yıl, 2 yıl veya süresiz yeni lisans anahtarı üretmesini sağlar.
    """
    s = get_settings()
    prefix = "KUP"
    edition_code = "ENT" if "enter" in body.edition.lower() else "PRO"
    dur_tag = f"{body.duration_years}Y" if body.duration_years > 0 else "LIFETIME"
    rand_segment = secrets.token_hex(3).upper()
    current_year = date.today().year

    # Örn: KUP-ENT-2026-1Y-A3F812
    generated_key = f"{prefix}-{edition_code}-{current_year}-{dur_tag}-{rand_segment}"
    sig = hashlib.sha256(f"{generated_key}:{s.secret_key}".encode()).hexdigest()

    expiry_date: date | None = None
    if body.duration_years > 0:
        expiry_date = date.today() + timedelta(days=365 * body.duration_years)

    return {
        "license_key": generated_key,
        "customer_name": body.customer_name,
        "edition": body.edition,
        "duration_years": body.duration_years,
        "expires_at": expiry_date.isoformat() if expiry_date else None,
        "signature": sig,
        "max_users": body.max_users,
        "max_assets": body.max_assets,
    }


@router.get("/app-license")
def get_app_license_status(
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("app_license.view")),
):
    lic = db.scalar(
        select(AppLicense)
        .where(AppLicense.tenant_id == me.tenant_id, AppLicense.is_deleted.is_(False))
        .order_by(AppLicense.created_at.desc())
    )
    user_cnt = db.scalar(select(func.count(User.id)).where(User.tenant_id == me.tenant_id, User.is_deleted.is_(False))) or 0
    asset_cnt = db.scalar(select(func.count(Asset.id)).where(Asset.tenant_id == me.tenant_id, Asset.is_deleted.is_(False))) or 0
    if not lic:
        return {"is_licensed": False, "current_users": user_cnt, "current_assets": asset_cnt}

    is_expired = False
    if lic.expires_at and lic.expires_at < date.today():
        is_expired = True

    return {
        "is_licensed": lic.is_active and not is_expired,
        "is_expired": is_expired,
        "customer_name": lic.customer_name,
        "edition": lic.edition,
        "license_key_masked": lic.license_key_masked,
        "max_users": lic.max_users,
        "current_users": user_cnt,
        "max_assets": lic.max_assets,
        "current_assets": asset_cnt,
        "issued_at": lic.issued_at,
        "expires_at": lic.expires_at,
        "signature": lic.signature[:24] + "...",
        "activations": len(lic.activations),
    }


@router.post("/app-license/activate")
def activate_app_license(
    body: AppLicenseActivateIn,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("app_license.manage")),
):
    s = get_settings()
    key_clean = body.license_key.strip().upper()
    key_hash = hashlib.sha256(key_clean.encode()).hexdigest()
    sig = hashlib.sha256(f"{key_clean}:{s.secret_key}".encode()).hexdigest()
    masked = f"{key_clean[:4]}-****-****-{key_clean[-4:]}"

    # Süre hesaplama (0: Süresiz, 1-10: Yıl bazlı)
    exp_date: date | None = None
    if body.duration_years > 0:
        exp_date = date.today() + timedelta(days=365 * body.duration_years)

    lic = db.scalar(select(AppLicense).where(AppLicense.tenant_id == me.tenant_id))
    if not lic:
        lic = AppLicense(
            tenant_id=me.tenant_id,
            customer_name=body.customer_name,
            edition=body.edition,
            license_key_hash=key_hash,
            license_key_masked=masked,
            max_users=body.max_users,
            max_assets=body.max_assets,
            features={"offline_lan": True, "pdf_reports": True, "qr_system": True, "multi_warehouse": True},
            issued_at=date.today(),
            expires_at=exp_date,
            signature=sig,
            is_active=True,
        )
        db.add(lic)
        db.flush()
    else:
        lic.customer_name = body.customer_name
        lic.edition = body.edition
        lic.license_key_hash = key_hash
        lic.license_key_masked = masked
        lic.max_users = body.max_users
        lic.max_assets = body.max_assets
        lic.issued_at = date.today()
        lic.expires_at = exp_date
        lic.signature = sig
        lic.is_active = True

    fp = hashlib.sha256(socket.gethostname().encode()).hexdigest()[:32]
    db.add(
        AppLicenseActivation(
            app_license_id=lic.id,
            machine_fingerprint=fp,
            hostname=socket.gethostname(),
            activated_by_user_id=me.id,
        )
    )
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="app_license.activate",
        entity="app_license",
        entity_id=lic.id,
        new={"customer": lic.customer_name, "edition": lic.edition},
        ip=client_ip(request),
    )
    db.commit()
    return {"ok": True, "customer_name": lic.customer_name, "edition": lic.edition}
