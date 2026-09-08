"""硬过滤：T1（max_occupancy=2）/ T2（min_child_age=7）/ T8（合约过期）资源不得进入候选；无解 query 必须给放宽建议。"""
from datetime import date

from app.schemas.search import HotelQuery
from app.services.retrieval import search_hotels

FAMILY_KYOTO = dict(city="京都", checkin=date(2026, 10, 15), checkout=date(2026, 10, 18), adults=2, children=1, child_ages=[5])


def test_t1_two_person_rooms_excluded(db):
    res = search_hotels(db, HotelQuery(**FAMILY_KYOTO, tiers=["5star", "luxury", "ryokan", "boutique"]))
    ids = {c.hotel_id for c in res.candidates}
    assert ids, "应有候选"
    assert not any("-T1-" in h for h in ids), ids
    assert all(c.max_occupancy >= 3 for c in res.candidates)


def test_t2_child_age_ryokan_excluded(db):
    res = search_hotels(db, HotelQuery(**FAMILY_KYOTO, tiers=["ryokan"]))
    ids = {c.hotel_id for c in res.candidates}
    assert not any("-T2-" in h for h in ids), ids
    assert all(c.min_child_age is None or c.min_child_age <= 5 for c in res.candidates)
    # 未记录的房型放行但被标记（约束层会判 UNKNOWN）
    assert all(c.child_age_unknown == (c.min_child_age is None) for c in res.candidates)


def test_t8_expired_contract_excluded(db):
    res = search_hotels(db, HotelQuery(city="东京", checkin=date(2026, 10, 15), checkout=date(2026, 10, 18), adults=2,
                                       tiers=["5star", "luxury", "4star", "boutique", "ryokan"]))
    ids = {c.hotel_id for c in res.candidates}
    assert ids
    assert not any("-T8-" in h for h in ids), ids


def test_impossible_query_returns_relaxation_hints(db):
    res = search_hotels(db, HotelQuery(city="箱根", checkin=date(2026, 10, 15), checkout=date(2026, 10, 18), adults=4, children=3,
                                       child_ages=[1, 2, 3], tiers=["luxury"], max_price_per_night=1000))
    assert res.candidates == []
    assert len(res.relaxation_hints) >= 1 and res.relaxation_hints[0].would_yield > 0


def test_impossible_tier_and_price_returns_two_hints(db):
    res = search_hotels(db, HotelQuery(city="东京", checkin=date(2026, 10, 15), checkout=date(2026, 10, 18), adults=2,
                                       tiers=["ryokan"], max_price_per_night=5000))
    assert res.candidates == []
    assert len(res.relaxation_hints) >= 2
