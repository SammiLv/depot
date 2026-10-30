"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

// 公司设计规范（MasterGo: Select 季度选择 / Input 输入框状态）:
//   触发器 32px 高、6px 圆角；正常边框 #D9D9D9，hover/展开 #3069F9，错误 #F53F3F
//   占位 #BDBDBD；面板 8px 圆角 + 三级阴影，选中行 #E8F2FF，头部年导航

/** 季度下拉面板选项 */
const QUARTER_PANEL_LABELS = ["Q1", "Q2", "Q3", "Q4"];

export function quarterSelectLabel(value: string) {
  const matched = value.match(/^(\d{4})-Q([1-4])$/);
  return matched ? `${matched[1]} Q${matched[2]}` : "";
}

/**
 * 季度选择器（设计稿 97:8423）：
 * 触发器 32px 高、6px 圆角；正常边框 #D9D9D9，hover/展开 #3069F9，错误 #F53F3F；
 * 面板 8px 圆角 + 三级阴影，头部年导航（‹ 2026 ›），选中行 #E8F2FF。
 * 面板 Portal 到 body，避免在滚动弹窗内被裁切。
 */
export function QuarterSelect({
  name,
  value,
  onChange,
  placeholder,
  invalid = false,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  invalid?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const currentYear = new Date().getFullYear();
  const valueYear = value ? Number(value.slice(0, 4)) : null;
  const minYear = Math.min(currentYear, valueYear ?? currentYear);
  const maxYear = Math.max(currentYear + 1, valueYear ?? currentYear);
  const [panelYear, setPanelYear] = useState(valueYear ?? currentYear);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // 面板按设计稿最窄 228px，不窄于触发器
    setPanelPos({ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 228) });
    if (valueYear) setPanelYear(valueYear);
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (trigger.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, valueYear]);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-8 flex-1 items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-sm leading-[22px] transition-colors ${
          invalid
            ? "border-[#F53F3F]"
            : open
              ? "border-[#3069F9]"
              : "border-[#D9D9D9] hover:border-[#3069F9]"
        }`}
      >
        <span className={value ? "text-[rgba(0,0,0,0.85)]" : "text-[#BDBDBD]"}>
          {value ? quarterSelectLabel(value) : placeholder}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180 text-[#3069F9]" : "text-[rgba(0,0,0,0.25)]"}`} />
      </button>
      {open && panelPos
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[70] overflow-hidden rounded-lg bg-white shadow-[0px_9px_28px_8px_rgba(0,0,0,0.05),0px_6px_16px_0px_rgba(0,0,0,0.08),0px_3px_6px_-4px_rgba(0,0,0,0.12)]"
              style={{ left: panelPos.left, top: panelPos.top, width: panelPos.width }}
            >
              <div className="flex h-9 items-center justify-between px-1.5">
                <button
                  type="button"
                  aria-label="上一年"
                  disabled={panelYear <= minYear}
                  onClick={() => setPanelYear((year) => year - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded text-[rgba(0,0,0,0.65)] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium text-[#181818]">{panelYear}</span>
                <button
                  type="button"
                  aria-label="下一年"
                  disabled={panelYear >= maxYear}
                  onClick={() => setPanelYear((year) => year + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded text-[rgba(0,0,0,0.65)] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="border-t border-[#F0F0F0]" />
              <div className="flex flex-col gap-0.5 p-1.5">
                {QUARTER_PANEL_LABELS.map((label, index) => {
                  const quarterValue = `${panelYear}-Q${index + 1}`;
                  const selected = quarterValue === value;
                  return (
                    <button
                      key={quarterValue}
                      type="button"
                      onClick={() => {
                        onChange(quarterValue);
                        setOpen(false);
                      }}
                      className={`flex h-8 items-center justify-center rounded-md text-sm ${
                        selected
                          ? "bg-[#E8F2FF] font-medium text-[#3069F9]"
                          : "text-[rgba(0,0,0,0.65)] hover:bg-[#F5F5F5]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

