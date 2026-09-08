"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { SlotName, SlotPrimitive, SlotValue } from "@/lib/api/types";
import { SLOT_LABEL, labelOf } from "@/lib/utils/format";
import { SLOT_KIND, SLOT_OPTIONS } from "../utils";

interface Props {
  slot: SlotName | null; current: SlotValue | null | undefined; saving: boolean; error: string | null;
  onSave: (slot: SlotName, value: SlotPrimitive) => Promise<void>; onClose: () => void;
}

export function SlotEditDialog(props: Props) {
  const { slot, onClose } = props;
  return (
    <Dialog open={!!slot} onClose={onClose} title={slot ? `修改「${SLOT_LABEL[slot]}」` : ""}>
      {/* 按槽位 key 重挂表单：初始值来自 props，不用 effect 同步 */}
      {slot && <SlotForm key={slot} {...props} slot={slot} />}
    </Dialog>
  );
}

function SlotForm({ slot, current, saving, error, onSave, onClose }: Props & { slot: SlotName }) {
  const kind = SLOT_KIND[slot];
  const options = SLOT_OPTIONS[slot] ?? [];
  const v = current?.value;
  const [text, setText] = useState(() => (v === null || v === undefined ? "" : Array.isArray(v) ? (v as Array<string | number>).join(", ") : String(v)));
  const [multi, setMulti] = useState<string[]>(() => (Array.isArray(v) ? (v as Array<string | number>).map(String) : []));

  function parse(): SlotPrimitive {
    if (kind === "multiEnum") return multi.length ? multi : null;
    const t = text.trim();
    if (!t) return null;
    if (kind === "int") { const n = Number(t.replace(/[^0-9.]/g, "")); return Number.isNaN(n) ? t : n; }
    if (kind === "intList") return t.split(/[,，、\s]+/).map((s) => Number(s)).filter((n) => !Number.isNaN(n));
    if (kind === "list") return t.split(/[,，、]+/).map((s) => s.trim()).filter(Boolean);
    return t;
  }
  async function submit(e: FormEvent) { e.preventDefault(); await onSave(slot, parse()); }

  return (
    <form onSubmit={submit} className="space-y-4">
      {kind === "multiEnum" && (
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">{SLOT_LABEL[slot]}</legend>
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 rounded-(--radius-control) border border-border px-3 py-2 text-sm cursor-pointer has-checked:border-primary has-checked:bg-primary-soft min-h-[44px]">
              <input type="checkbox" checked={multi.includes(o)} onChange={(e) => setMulti(e.target.checked ? [...multi, o] : multi.filter((x) => x !== o))} />
              {labelOf(o)}
            </label>
          ))}
        </fieldset>
      )}
      {kind === "enum" && (
        <div>
          <label htmlFor="slot-select" className="block text-xs text-muted mb-1">{SLOT_LABEL[slot]}</label>
          <select id="slot-select" value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-(--radius-control) border border-border bg-surface px-3 py-2 text-sm min-h-[44px]">
            <option value="">（未填）</option>
            {options.map((o) => <option key={o} value={o}>{labelOf(o)}</option>)}
          </select>
        </div>
      )}
      {(kind === "int" || kind === "intList" || kind === "list" || kind === "date" || kind === "text") && (
        <div>
          <label htmlFor="slot-input" className="block text-xs text-muted mb-1">
            {SLOT_LABEL[slot]}
            {kind === "intList" && "（多个用逗号分隔，如 5, 8）"}{kind === "list" && "（多个用逗号分隔）"}{kind === "date" && "（YYYY-MM-DD）"}
          </label>
          <input id="slot-input" type={kind === "int" ? "number" : kind === "date" ? "date" : "text"} value={text} onChange={(e) => setText(e.target.value)}
            className="w-full rounded-(--radius-control) border border-border bg-surface px-3 py-2 text-sm min-h-[44px]" autoFocus />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">保存后记为「顾问填写」，后续 AI 抽取不会改写这个值。清空即删除。</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>取消</Button>
        <Button type="submit" loading={saving}>保存修改</Button>
      </div>
    </form>
  );
}
