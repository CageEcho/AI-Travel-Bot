"use client";

import { Dialog } from "@/components/ui/dialog";
import type { MetaInfo } from "@/lib/api/types";

export function HelpDialog({ open, onClose, meta }: { open: boolean; onClose: () => void; meta: MetaInfo | null }) {
  return (
    <Dialog open={open} onClose={onClose} title="关于行策 · M0">
      <div className="space-y-4 text-sm leading-6">
        <p>行策是面向高端旅行顾问的 AI 行程方案生成工作台。粘贴客户原话，AI 逐项确认需求，系统在结构化知识库中硬过滤检索、编排行程、校验七条硬约束并逐分核算成本，顾问审核后交付客户。</p>
        <div className="rounded-(--radius-control) bg-surface-2 p-3 text-[13px]">
          <div className="flex justify-between"><span className="text-muted">模型提供方</span><b>{meta ? meta.provider : "—"}</b></div>
          <div className="flex justify-between"><span className="text-muted">模型</span><b>{meta ? meta.model : "—"}</b></div>
          <div className="flex justify-between"><span className="text-muted">编排模式</span><b>{meta ? (meta.planner_mode === "llm" ? "模型编排" : "确定性编排（降级）") : "—"}</b></div>
          <div className="flex justify-between"><span className="text-muted">模型密钥</span><b>{meta ? (meta.llm_configured ? "已配置" : "未配置") : "—"}</b></div>
          <div className="flex justify-between"><span className="text-muted">当前身份</span><b>{meta ? `${meta.user_id} · ${meta.role}` : "—"}</b></div>
          <div className="flex justify-between"><span className="text-muted">成本权限</span><b>{meta ? (meta.cost_visible ? "可查看" : "已隔离") : "—"}</b></div>
        </div>
        <ul className="list-disc pl-5 text-[13px] text-muted space-y-1">
          <li>资源数据为模拟数据集，非真实供应商信息。</li>
          <li>金额全部由规则引擎计算，模型不参与任何数字。</li>
          <li>待核实清单中的项目是系统「无法判定」而不是「通过」，交付前必须人工核实。</li>
          <li>M0 阶段已支持 API Key 身份认证、角色级成本隔离，以及客户版方案预览与导出。</li>
        </ul>
      </div>
    </Dialog>
  );
}
