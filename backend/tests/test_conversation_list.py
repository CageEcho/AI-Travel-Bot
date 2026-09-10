"""侧栏会话列表与运行元信息。"""


def test_list_conversations_and_meta(client):
    r = client.post("/api/v1/conversations"); assert r.status_code == 201
    cid = r.json()["conv_id"]
    client.patch(f"/api/v1/conversations/{cid}/card", json={"slot": "adults", "value": 2})
    res = client.get("/api/v1/conversations?limit=10")
    assert res.status_code == 200
    items = res.json()["items"]
    mine = next(i for i in items if i["conv_id"] == cid)
    assert mine["title"] == "未命名会话" and mine["confirmed"] is False and mine["plan_status"] is None
    assert mine["completeness"] > 0
    assert items[0]["conv_id"] == cid          # 最近活动排在最前
    m = client.get("/api/v1/meta").json()
    assert m["provider"] in ("anthropic", "deepseek") and m["model"] and "milestone" in m
    assert "api_key" not in str(m).lower()
