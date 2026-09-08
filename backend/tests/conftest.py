"""测试基座：独立的内嵌 PostgreSQL（.pgdata-test），跑 Alembic 迁移 + 载入种子数据。模型调用一律不发生。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ["DATABASE_URL"] = f"embedded:///{ROOT / '.pgdata-test'}"
os.environ["PLANNER_MODE"] = "heuristic"
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-placeholder")   # 不会真的调用
sys.path.insert(0, str(ROOT))            # seed 包
sys.path.insert(0, str(ROOT / "backend"))

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.db import get_sessionmaker, resolve_database_url  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    url = resolve_database_url()
    cfg = Config(str(ROOT / "backend" / "alembic.ini"))
    cfg.cmd_opts = type("o", (), {"x": [f"db_url={os.environ['DATABASE_URL']}"]})()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    from seed.load import load
    load(quiet=True)
    yield url


@pytest.fixture()
def db(database):
    s = get_sessionmaker()()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def client(database):
    from app.main import app
    with TestClient(app) as c:
        yield c
