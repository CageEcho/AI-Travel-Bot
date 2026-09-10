import { beforeEach, describe, expect, it } from "vitest";
import { saveInitialMessage, takeInitialMessage } from "@/features/conversation/bootstrap";

describe("首页客户原话交接", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("按会话保存并且只消费一次", () => {
    saveInitialMessage("CNV-1", "一家三口十月去日本");

    expect(takeInitialMessage("CNV-1")).toBe("一家三口十月去日本");
    expect(takeInitialMessage("CNV-1")).toBeNull();
  });

  it("不同会话之间不会串内容", () => {
    saveInitialMessage("CNV-1", "东京");
    saveInitialMessage("CNV-2", "京都");

    expect(takeInitialMessage("CNV-2")).toBe("京都");
    expect(takeInitialMessage("CNV-1")).toBe("东京");
  });
});
