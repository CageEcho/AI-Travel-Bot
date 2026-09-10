"""客户隐私数据最小化。

顾问粘贴的客户原话可能含姓名、电话、邮箱等 PII。业务只需要旅行需求，
因此这些字段在写入消息表或发送给模型前统一替换为不可逆占位符。
"""
from __future__ import annotations

import re


_LABELED_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?P<label>(?:客户)?姓名|联系人|称呼)\s*[:：=]\s*[\u4e00-\u9fff·]{2,8}"), r"\g<label>：[姓名]"),
    (re.compile(r"(?P<label>手机(?:号)?|电话|联系电话|联系方式)\s*[:：=]?\s*\+?\d[\d\s-]{5,18}\d"), r"\g<label>：[电话号码]"),
    (re.compile(r"(?P<label>微信号?|WeChat|wx)\s*[:：=]\s*[A-Za-z][A-Za-z0-9_-]{5,19}", re.IGNORECASE), r"\g<label>：[微信号]"),
    (re.compile(r"(?P<label>QQ)\s*[:：=]\s*[1-9]\d{4,11}", re.IGNORECASE), r"\g<label>：[QQ]"),
    (re.compile(r"(?P<label>护照号?)\s*[:：=]\s*[A-Za-z0-9]{5,20}"), r"\g<label>：[护照号]"),
    (re.compile(r"(?P<label>家庭住址|住址|地址)\s*[:：=]\s*[^，,。;；\n]{4,80}"), r"\g<label>：[地址]"),
)

_VALUE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?<![\w.+-])[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![\w.-])"), "[邮箱]"),
    (re.compile(r"(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d(?:[-\s]?\d){8}(?!\d)"), "[手机号]"),
    (re.compile(r"(?<!\d)\d{17}[0-9Xx](?!\d)"), "[身份证号]"),
)


def redact_pii(text: str) -> str:
    """脱敏常见客户 PII；不命中的旅行需求原样保留。"""
    redacted = text
    for pattern, replacement in _LABELED_PATTERNS + _VALUE_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted
