from fastapi import APIRouter

from app.api.v1 import conversations, plans, search, trace

router = APIRouter(prefix="/api/v1")   # 前缀集中定义（手册 [B]）
router.include_router(conversations.router)
router.include_router(plans.router)
router.include_router(search.router)
router.include_router(trace.router)
