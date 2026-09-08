"""人工卡点：未 confirm 的 card 调 POST /plans → 409；完整度不足调 confirm → 409。统一错误结构，不泄漏堆栈。"""


def _conv(client) -> str:
    r = client.post("/api/v1/conversations")
    assert r.status_code == 201
    return r.json()["conv_id"]


def _fill(client, conv, **slots):
    for k, v in slots.items():
        r = client.patch(f"/api/v1/conversations/{conv}/card", json={"slot": k, "value": v})
        assert r.status_code == 200, r.text
    return r.json()


FULL = dict(destination_cities=["京都"], date_start="2026-10-15", duration_days=4, adults=2, children=1, child_ages=[5],
            budget_amount=100000, budget_basis="total", budget_incl_flight="no", hotel_tier=["5star", "luxury"],
            dietary=["no_raw"], accessibility="none")


def test_unconfirmed_card_cannot_generate(client):
    conv = _conv(client)
    card = _fill(client, conv, **FULL)
    assert card["completeness"] >= 0.85 and not card["confirmed"]
    r = client.post("/api/v1/plans", json={"card_id": card["card_id"]})
    assert r.status_code == 409
    assert r.json() == {"error": {"code": "CARD_NOT_CONFIRMED", "message": "需求卡尚未确认，无法生成方案"}}


def test_low_completeness_cannot_confirm(client):
    conv = _conv(client)
    card = _fill(client, conv, adults=2, destination_cities=["京都"])
    assert card["completeness"] < 0.85
    r = client.post(f"/api/v1/conversations/{conv}/card/confirm")
    assert r.status_code == 409
    body = r.json()
    assert body["error"]["code"] == "COMPLETENESS_TOO_LOW" and "traceback" not in r.text.lower()
    assert "dietary" in body["error"]["details"]["missing"]


def test_unknown_slot_and_missing_conv(client):
    conv = _conv(client)
    r = client.patch(f"/api/v1/conversations/{conv}/card", json={"slot": "favorite_color", "value": "blue"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "SLOT_UNKNOWN"
    r = client.get("/api/v1/conversations/CNV-nope/card")
    assert r.status_code == 404 and r.json()["error"]["code"] == "CONV_NOT_FOUND"
    r = client.get("/api/v1/plans/PLN-nope/status")
    assert r.status_code == 404 and r.json()["error"]["code"] == "PLAN_NOT_FOUND"


def test_search_param_validation(client):
    r = client.get("/api/v1/search/hotels", params={"city": "京都", "checkin": "2026-10-18", "checkout": "2026-10-15", "adults": 2})
    assert r.status_code == 400 and r.json()["error"]["code"] == "PARAM_INVALID"
    r = client.get("/api/v1/search/hotels", params={"city": "京都", "checkin": "2026-10-15", "checkout": "2026-10-18", "adults": 2,
                                                    "children": 1, "child_ages": ""})
    assert r.status_code == 400   # child_ages 长度必须等于 children


def test_advisor_input_not_overwritten_and_confirm_freezes_version(client):
    conv = _conv(client)
    card = _fill(client, conv, **FULL)
    assert card["slots"]["adults"]["source"] == "advisor_input"
    r = client.post(f"/api/v1/conversations/{conv}/card/confirm")
    assert r.status_code == 200 and r.json()["version"] == 1
    # confirm 后再改 → 新版本，旧版本冻结
    card2 = _fill(client, conv, pace="relaxed")
    assert card2["version"] == 2 and not card2["confirmed"]
    assert client.get(f"/api/v1/conversations/{conv}/card").json()["version"] == 2
