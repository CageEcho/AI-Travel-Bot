import { api } from "@/lib/api/client";
import type { SearchResult } from "@/lib/api/types";

export interface HotelQueryInput {
  city: string; checkin: string; checkout: string; adults: number; children: number; child_ages: string; tiers: string[]; max_price_per_night: string;
}

export const searchApi = {
  hotels: (q: HotelQueryInput) => {
    const p = new URLSearchParams({ city: q.city, checkin: q.checkin, checkout: q.checkout, adults: String(q.adults), children: String(q.children) });
    if (q.child_ages.trim()) p.set("child_ages", q.child_ages.replace(/[，、\s]+/g, ","));
    if (q.tiers.length) p.set("tiers", q.tiers.join(","));
    if (q.max_price_per_night.trim()) p.set("max_price_per_night", q.max_price_per_night.trim());
    return api.get<SearchResult>(`/search/hotels?${p.toString()}`);
  },
};
