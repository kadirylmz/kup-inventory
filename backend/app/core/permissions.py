"""İzin kataloğu ve sistem rollerinin varsayılan izinleri (modül.işlem)."""

MODULES: dict[str, list[str]] = {
    "dashboard": ["view"],
    "product": ["view", "create", "update", "delete", "deactivate"],
    "category": ["view", "manage"],
    "brand": ["view", "manage"],
    "warehouse": ["view", "manage"],
    "movement": ["view", "create", "approve"],
    "project": ["view", "manage"],
    "employee": ["view", "manage"],
    "assignment": ["view", "manage"],
    "license": ["view", "manage", "view_key"],
    "maintenance": ["view", "manage"],
    "stocktake": ["view", "perform", "approve"],
    "valuation": ["view", "update", "approve"],
    "report": ["view", "generate"],
    "notification": ["view"],
    "audit": ["view"],
    "user": ["view", "manage"],
    "role": ["view", "manage"],
    "setting": ["view", "manage"],
    "backup": ["view", "manage"],
    "app_license": ["view", "manage"],
}

ALL_CODES = [f"{m}.{a}" for m, acts in MODULES.items() for a in acts]
VIEW_CODES = [c for c in ALL_CODES if c.endswith(".view") and not c.startswith(("audit", "user", "role", "setting", "backup", "app_license"))]


def _mods(*mods: str, only: tuple[str, ...] | None = None) -> list[str]:
    return [c for c in ALL_CODES if c.split(".")[0] in mods and (only is None or c.split(".")[1] in only)]


SYSTEM_ROLES: dict[str, dict] = {
    "ADMIN": {"name": "Yönetici", "perms": ALL_CODES},
    "INVENTORY_MANAGER": {
        "name": "Envanter Yöneticisi",
        "perms": sorted(set(VIEW_CODES + _mods("product", "category", "brand", "warehouse", "movement", "assignment", "employee", "valuation", "stocktake") + ["report.generate"])),
    },
    "TECHNICIAN": {
        "name": "Teknisyen",
        "perms": ["product.view", "product.create"],
    },
    "PROJECT_MANAGER": {
        "name": "Proje Yöneticisi",
        "perms": sorted(set(VIEW_CODES + ["project.manage", "movement.create"])),
    },
    "VIEWER": {
        "name": "Görüntüleyici",
        "perms": [
            "dashboard.view",
            "product.view",
            "project.view",
            "assignment.view",
            "valuation.view",
            "report.view",
            "report.generate",
        ],
    },
}
