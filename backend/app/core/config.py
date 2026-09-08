"""集中配置（手册 [A]：阈值与权重不硬编码，全部可配置）。"""
from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录（AI旅行项目/），.env 放在这里
ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # 模型提供方：anthropic（默认，Claude 原生结构化输出）| deepseek（Anthropic 兼容端点 + 强制工具调用取结构化结果）
    llm_provider: str = "anthropic"
    anthropic_api_key: str = ""
    claude_model: str = "claude-opus-5"
    plan_effort: str = "high"
    # DeepSeek：复用 anthropic SDK，只换 base_url / key / 模型名。可选 deepseek-v4-pro（默认）| deepseek-v4-flash
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/anthropic"
    deepseek_model: str = "deepseek-v4-pro"
    # DeepSeek 思考模式与强制 tool_choice 互斥（400）。False：关思考 + 强制调用结果工具（默认，可靠）；True：开思考 + tool_choice=auto（靠指令与重试兜底）
    deepseek_thinking: bool = False
    deepseek_max_attempts: int = 3          # DeepSeek 对 schema 的遵循弱于 Claude 原生结构化输出，多给一次重试

    # 数据库：postgresql+psycopg://... 或 embedded:///<数据目录>（无 Docker 时的内嵌 PG）
    database_url: str = "postgresql+psycopg://postgres:dev@localhost:5432/travel"

    # 约束阈值
    commute_max_min: int = 180
    commute_max_min_transfer: int = 300
    price_staleness_days: int = 90
    resource_staleness_days: int = 180

    # 编排
    max_replan_rounds: int = 3
    completeness_threshold: float = 0.85
    generation_timeout_sec: int = 300
    min_candidates_to_plan: int = 3           # 硬过滤后候选 < 3 → 先给放宽建议，不硬生成
    # 编排器：llm（默认，Claude 结构化输出）| heuristic（确定性编排器：eval --dry-run / 无 Key 降级路径）
    planner_mode: str = "llm"

    # 成本
    service_fee_rate: Decimal = Decimal("0.08")
    fx_jpy_cny: Decimal = Decimal("0.0479")

    # 排序权重
    w_tag_match: float = 0.50
    w_price_fit: float = 0.30
    w_freshness: float = 0.20
    w_commercial: float = 0.00

    # 服务
    api_port: int = 8000
    log_level: str = "INFO"

    @field_validator("w_commercial")
    @classmethod
    def cap_commercial(cls, v: float) -> float:
        if v > 0.10:
            raise ValueError("商业优先级权重上限 0.10（PRD-v2 决策，不可调高）")
        return v

    @field_validator("llm_provider")
    @classmethod
    def _check_provider(cls, v: str) -> str:
        if v not in ("anthropic", "deepseek"):
            raise ValueError("LLM_PROVIDER 必须是 anthropic / deepseek")
        return v

    @field_validator("plan_effort")
    @classmethod
    def check_effort(cls, v: str) -> str:
        if v not in {"low", "medium", "high", "xhigh", "max"}:
            raise ValueError("PLAN_EFFORT 必须是 low/medium/high/xhigh/max")
        return v


settings = Settings()
