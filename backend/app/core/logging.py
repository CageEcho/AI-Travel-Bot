"""trace_log 写入：记录 step / 耗时 / token / 错误类型。

边界（手册 [A]）：不记密钥，不记完整客户原话（只记 digest）。
"""
from __future__ import annotations

import hashlib
import logging
import time
from contextlib import contextmanager
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def digest(text: str) -> str:
    """客户原话只记摘要，不进日志。"""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def write_trace(db: Session, *, step: str, conv_id: str | None = None, plan_id: str | None = None,
                latency_ms: int | None = None, input_tokens: int | None = None,
                output_tokens: int | None = None, payload: dict[str, Any] | None = None) -> None:
    from app.models.business import TraceLog  # 延迟导入避免循环

    db.add(TraceLog(conv_id=conv_id, plan_id=plan_id, step=step, latency_ms=latency_ms,
                    input_tokens=input_tokens, output_tokens=output_tokens, payload=payload or {}))
    db.commit()


@contextmanager
def timed():
    """with timed() as t: ...; t['ms']"""
    box: dict[str, int] = {}
    t0 = time.perf_counter()
    try:
        yield box
    finally:
        box["ms"] = int((time.perf_counter() - t0) * 1000)
