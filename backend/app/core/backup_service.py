import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
import os
import zipfile
import hashlib
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.db.base import Base

def serialize_val(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, bytes):
        return v.hex()
    return v

def dump_tenant_data(db: Session, tenant_id: uuid.UUID) -> dict:
    import app.models.core
    import app.models.inventory
    import app.models.warehouse_assignment
    import app.models.project_license_maintenance
    import app.models.finance_count_system

    data = {
        "version": "2.0",
        "tenant_id": str(tenant_id),
        "exported_at": datetime.utcnow().isoformat(),
        "tables": {}
    }

    for table in Base.metadata.sorted_tables:
        tname = table.name
        if "tenant_id" in table.c:
            stmt = table.select().where(table.c.tenant_id == tenant_id)
        else:
            stmt = table.select()
        rows = db.execute(stmt).mappings().all()
        data["tables"][tname] = [
            {k: serialize_val(v) for k, v in row.items()}
            for row in rows
        ]
    return data

def restore_tenant_data(db: Session, zip_bytes: bytes, target_tenant_id: uuid.UUID, upload_dir: str):
    import io
    import app.models.core
    import app.models.inventory
    import app.models.warehouse_assignment
    import app.models.project_license_maintenance
    import app.models.finance_count_system

    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    if "data_dump.json" not in zf.namelist():
        raise ValueError("Yedek dosyası içinde 'data_dump.json' bulunamadı.")

    dump = json.loads(zf.read("data_dump.json").decode("utf-8"))
    tables_data = dump.get("tables", {})

    # Restore uploads
    up_path = Path(upload_dir)
    up_path.mkdir(parents=True, exist_ok=True)
    for member in zf.namelist():
        if member.startswith("uploads/") and not member.endswith("/"):
            rel = member[len("uploads/"):]
            dest = up_path / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(zf.read(member))

    # Disable FK constraints during restore in PostgreSQL
    db.execute(text("SET session_replication_role = 'replica';"))

    # Clean existing tenant data in reverse order
    for table in reversed(Base.metadata.sorted_tables):
        if "tenant_id" in table.c:
            db.execute(table.delete().where(table.c.tenant_id == target_tenant_id))
        elif table.name in ["currencies", "permissions"]:
            pass # Keep shared system references
        else:
            db.execute(table.delete())

    # Insert restored data in sorted order
    for table in Base.metadata.sorted_tables:
        tname = table.name
        rows = tables_data.get(tname, [])
        if not rows:
            continue
        col_types = {c.name: c.type for c in table.columns}
        processed_rows = []
        for r in rows:
            row_dict = dict(r)
            if "tenant_id" in row_dict and "tenant_id" in table.c:
                row_dict["tenant_id"] = str(target_tenant_id)
            for k, val in list(row_dict.items()):
                if val is not None and k in col_types:
                    # Let SQLAlchemy or native driver parse string ISO dates/datetimes/UUIDs/Decimals
                    pass
            processed_rows.append(row_dict)

        if processed_rows:
            db.execute(table.insert(), processed_rows)

    db.execute(text("SET session_replication_role = 'DEFAULT';"))
    db.commit()
    return dump
