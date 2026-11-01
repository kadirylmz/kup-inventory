from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.v1 import auth, files, finance_count_system, inventory, project_license_maintenance, users, warehouse_assignment
from app.core.deps import require_permission
from app.db.session import get_db
from app.models.core import AuditLog, User

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(inventory.router)
api_router.include_router(files.router)
api_router.include_router(warehouse_assignment.router)
api_router.include_router(project_license_maintenance.router)
api_router.include_router(finance_count_system.router)


@api_router.get("/audit", tags=["audit"])
def list_audit(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    me: User = Depends(require_permission("audit.view")),
):
    rows = db.scalars(
        select(AuditLog)
        .where(AuditLog.tenant_id == me.tenant_id)
        .order_by(AuditLog.created_at.desc())
        .limit(min(limit, 500))
        .offset(offset)
    ).all()
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "action": r.action,
            "entity": r.entity,
            "entity_id": r.entity_id,
            "old_value": r.old_value,
            "new_value": r.new_value,
            "ip": r.ip,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@api_router.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


@api_router.get("/ready", tags=["system"])
def ready(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(503, "Veritabanına erişilemiyor.")
    return {"status": "ready"}
