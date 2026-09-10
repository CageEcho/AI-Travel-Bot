from fastapi import APIRouter, Depends

from app.api.v1 import conversations, plans, search, trace, meta
from app.core.auth import current_principal

router = APIRouter(prefix="/api/v1", dependencies=[Depends(current_principal)])   # 业务 API 默认鉴权
router.include_router(conversations.router)
router.include_router(plans.router)
router.include_router(search.router)
router.include_router(trace.router)
router.include_router(meta.router)
