"""运行元信息：前端侧栏展示当前模型提供方与运行模式（只读，不含密钥）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.auth import Principal, current_principal
from app.core.llm import active_model

router = APIRouter(prefix="/meta", tags=["meta"])


class MetaInfo(BaseModel):
    provider: str
    model: str
    planner_mode: str
    llm_configured: bool
    milestone: str = "M0"
    auth_enabled: bool
    user_id: str
    role: str
    cost_visible: bool


@router.get("", response_model=MetaInfo)
def meta(principal: Principal = Depends(current_principal)) -> MetaInfo:
    configured = bool(settings.deepseek_api_key) if settings.llm_provider == "deepseek" else True  # anthropic 可走 ant 登录凭证
    return MetaInfo(provider=settings.llm_provider, model=active_model(), planner_mode=settings.planner_mode,
                    llm_configured=configured, auth_enabled=settings.auth_enabled, user_id=principal.user_id,
                    role=principal.role, cost_visible=principal.can_view_cost)


@router.get("/me")
def me(principal: Principal = Depends(current_principal)) -> dict:
    """供前端验证登录凭证；不回显 API Key。"""
    return {"user_id": principal.user_id, "role": principal.role, "cost_visible": principal.can_view_cost}
