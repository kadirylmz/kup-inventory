import hashlib
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import client_ip, get_current_user, require_permission, write_audit
from app.db.session import get_db
from app.models.core import User
from app.models.inventory import Asset, FileAttachment, Product, ProductDocument, ProductImage
from app.schemas.inventory import DocumentOut, ImageOut

router = APIRouter(tags=["files"])

ALLOWED_IMAGES = {
    ".jpg": ("image/jpeg", b"\xff\xd8\xff"),
    ".jpeg": ("image/jpeg", b"\xff\xd8\xff"),
    ".png": ("image/png", b"\x89PNG\r\n\x1a\n"),
    ".webp": ("image/webp", b"RIFF"),
}

ALLOWED_DOCS = {
    **ALLOWED_IMAGES,
    ".pdf": ("application/pdf", b"%PDF-"),
}


def _verify_and_store(upload: UploadFile, allowed_map: dict, tenant_id: uuid.UUID, user_id: uuid.UUID,
                      owner_type: str, owner_id: uuid.UUID, db: Session) -> FileAttachment:
    s = get_settings()
    orig_name = Path(upload.filename or "file").name
    ext = Path(orig_name).suffix.lower()
    if ext not in allowed_map:
        raise HTTPException(422, f"Desteklenmeyen dosya uzantısı: {ext}")

    expected_mime, magic = allowed_map[ext]
    data = upload.file.read(s.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Dosya boyutu en fazla {s.max_upload_mb} MB olabilir.")
    if len(data) < len(magic) or not data.startswith(magic):
        raise HTTPException(422, "Dosya içeriği (magic-byte) uzantısıyla uyuşmuyor.")
    if ext == ".webp" and data[8:12] != b"WEBP":
        raise HTTPException(422, "Geçersiz WEBP dosyası.")

    sha = hashlib.sha256(data).hexdigest()
    target_dir = Path(s.upload_dir) / str(tenant_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    full_path = target_dir / stored_name
    full_path.write_bytes(data)

    fa = FileAttachment(
        tenant_id=tenant_id,
        storage_path=str(full_path),
        original_name=orig_name,
        mime_type=expected_mime,
        size_bytes=len(data),
        sha256=sha,
        owner_type=owner_type,
        owner_id=owner_id,
        uploaded_by=user_id,
    )
    db.add(fa)
    db.flush()
    return fa


@router.get("/files/{file_id}")
def serve_file(file_id: uuid.UUID, db: Session = Depends(get_db)):
    """Yüklenen fotoğraf veya belgeyi sunar (QR ve arayüz önizlemeleri için)."""
    fa = db.get(FileAttachment, file_id)
    if not fa or fa.is_deleted or not os.path.isfile(fa.storage_path):
        raise HTTPException(404, "Dosya bulunamadı.")
    return FileResponse(fa.storage_path, media_type=fa.mime_type, filename=fa.original_name)


@router.post("/products/{product_id}/images", response_model=ImageOut, status_code=201)
def upload_product_image(
    product_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    caption: str | None = Form(default=None),
    is_primary: bool = Form(default=False),
    asset_id: uuid.UUID | None = Form(default=None),
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    prod = db.get(Product, product_id)
    if not prod or prod.tenant_id != me.tenant_id or prod.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")

    fa = _verify_and_store(file, ALLOWED_IMAGES, me.tenant_id, me.id, "product_image", product_id, db)

    has_any = db.scalar(select(ProductImage).where(ProductImage.product_id == product_id)) is not None
    make_primary = is_primary or not has_any
    if make_primary:
        for existing in db.scalars(select(ProductImage).where(ProductImage.product_id == product_id)):
            existing.is_primary = False
        prod.primary_image_id = fa.id
        if asset_id:
            asset = db.get(Asset, asset_id)
            if asset and asset.tenant_id == me.tenant_id:
                asset.primary_image_id = fa.id

    img = ProductImage(
        tenant_id=me.tenant_id,
        product_id=product_id,
        asset_id=asset_id,
        file_id=fa.id,
        caption=caption,
        is_primary=make_primary,
    )
    db.add(img)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="product.image_upload",
        entity="product",
        entity_id=product_id,
        new={"file": fa.original_name, "is_primary": make_primary},
        ip=client_ip(request),
    )
    db.commit()
    return ImageOut(
        id=img.id,
        file_id=fa.id,
        url=f"/api/v1/files/{fa.id}",
        original_name=fa.original_name,
        caption=img.caption,
        is_primary=img.is_primary,
        created_at=img.created_at,
    )


@router.get("/products/{product_id}/images", response_model=list[ImageOut])
def list_product_images(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.view")),
):
    imgs = db.scalars(
        select(ProductImage)
        .where(ProductImage.tenant_id == me.tenant_id, ProductImage.product_id == product_id)
        .order_by(ProductImage.is_primary.desc(), ProductImage.created_at.desc())
    ).all()
    return [
        ImageOut(
            id=i.id,
            file_id=i.file_id,
            url=f"/api/v1/files/{i.file_id}",
            original_name=i.file.original_name,
            caption=i.caption,
            is_primary=i.is_primary,
            created_at=i.created_at,
        )
        for i in imgs
    ]


@router.delete("/products/{product_id}/images/{image_id}", status_code=204)
def delete_product_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    img = db.get(ProductImage, image_id)
    if not img or img.tenant_id != me.tenant_id or img.product_id != product_id:
        raise HTTPException(404, "Görsel bulunamadı.")
    prod = db.get(Product, product_id)
    if prod and prod.primary_image_id == img.file_id:
        prod.primary_image_id = None
    db.delete(img)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="product.image_delete",
        entity="product",
        entity_id=product_id,
        ip=client_ip(request),
    )
    db.commit()


@router.post("/products/{product_id}/images/{image_id}/set-primary", status_code=200)
def set_primary_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    img = db.get(ProductImage, image_id)
    if not img or img.tenant_id != me.tenant_id or img.product_id != product_id:
        raise HTTPException(404, "Görsel bulunamadı.")
    
    for oi in db.scalars(select(ProductImage).where(ProductImage.product_id == product_id)):
        oi.is_primary = (oi.id == image_id)
    
    prod = db.get(Product, product_id)
    if prod:
        prod.primary_image_id = img.file_id
    
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="product.image_set_primary",
        entity="product",
        entity_id=product_id,
        new={"image_id": str(image_id)},
        ip=client_ip(request),
    )
    db.commit()
    return {"detail": "Kapak fotoğrafı güncellendi."}


@router.post("/products/{product_id}/documents", response_model=DocumentOut, status_code=201)
def upload_product_document(
    product_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    doc_type: str = Form(default="other"),
    asset_id: uuid.UUID | None = Form(default=None),
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    prod = db.get(Product, product_id)
    if not prod or prod.tenant_id != me.tenant_id or prod.is_deleted:
        raise HTTPException(404, "Ürün bulunamadı.")
    fa = _verify_and_store(file, ALLOWED_DOCS, me.tenant_id, me.id, "product_document", product_id, db)
    doc = ProductDocument(
        tenant_id=me.tenant_id,
        product_id=product_id,
        asset_id=asset_id,
        file_id=fa.id,
        doc_type=doc_type,
        title=title,
    )
    db.add(doc)
    db.flush()
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="product.document_upload",
        entity="product",
        entity_id=product_id,
        new={"title": title, "doc_type": doc_type, "file": fa.original_name},
        ip=client_ip(request),
    )
    db.commit()
    return DocumentOut(
        id=doc.id,
        file_id=fa.id,
        url=f"/api/v1/files/{fa.id}",
        original_name=fa.original_name,
        doc_type=doc.doc_type,
        title=doc.title,
        size_bytes=fa.size_bytes,
        created_at=doc.created_at,
    )


@router.get("/products/{product_id}/documents", response_model=list[DocumentOut])
def list_product_documents(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.view")),
):
    docs = db.scalars(
        select(ProductDocument)
        .where(ProductDocument.tenant_id == me.tenant_id, ProductDocument.product_id == product_id)
        .order_by(ProductDocument.created_at.desc())
    ).all()
    return [
        DocumentOut(
            id=d.id,
            file_id=d.file_id,
            url=f"/api/v1/files/{d.file_id}",
            original_name=d.file.original_name,
            doc_type=d.doc_type,
            title=d.title,
            size_bytes=d.file.size_bytes,
            created_at=d.created_at,
        )
        for d in docs
    ]


@router.delete("/products/{product_id}/documents/{document_id}", status_code=204)
def delete_product_document(
    product_id: uuid.UUID,
    document_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("product.update")),
):
    doc = db.get(ProductDocument, document_id)
    if not doc or doc.tenant_id != me.tenant_id or doc.product_id != product_id:
        raise HTTPException(404, "Belge bulunamadı.")
    db.delete(doc)
    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="product.document_delete",
        entity="product",
        entity_id=product_id,
        ip=client_ip(request),
    )
    db.commit()

@router.post("/settings/logo", status_code=200)
def upload_company_logo(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("setting.manage")),
):
    """Şirket logosu yükler ve ayarlara kaydeder."""
    from app.models.core import Setting
    fa = _verify_and_store(
        file,
        ALLOWED_IMAGES,
        me.tenant_id,
        me.id,
        "company_logo",
        me.tenant_id,
        db,
    )
    logo_url = f"/api/v1/files/{fa.id}"
    row = db.scalar(select(Setting).where(Setting.tenant_id == me.tenant_id, Setting.key == "general"))
    if not row:
        row = Setting(tenant_id=me.tenant_id, key="general", value={"logo_url": logo_url})
        db.add(row)
    else:
        new_val = dict(row.value or {})
        new_val["logo_url"] = logo_url
        row.value = new_val

    write_audit(
        db,
        tenant_id=me.tenant_id,
        user_id=me.id,
        action="settings.upload_logo",
        entity="setting",
        new={"logo_url": logo_url},
        ip=client_ip(request),
    )
    db.commit()
    return {"logo_url": logo_url, "file_id": str(fa.id)}
