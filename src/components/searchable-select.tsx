"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export type SearchableSelectOption = { value: string; label: string };

type SearchableSelectProps = {
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 渲染 hidden input 兼容 FormData 表单提交 */
  name?: string;
  disabled?: boolean;
  className?: string;
};

// 公司设计规范（与 @rjmart/ui 同 token）：32px 高、6px 圆角、边框 #D9D9D9、hover/聚焦 #3069F9
const TRIGGER_CLASS =
  "flex h-8 w-full items-center gap-2 rounded-md border border-[#D9D9D9] bg-white px-3 text-sm leading-[22px] transition-colors hover:border-[#3069F9] focus-within:border-[#3069F9]";
const PANEL_SHADOW =
  "0px 9px 28px 8px rgba(0,0,0,0.05), 0px 6px 16px 0px rgba(0,0,0,0.08), 0px 3px 6px -4px rgba(0,0,0,0.12)";

/**
 * 可搜索单选（自绘下拉，风格对齐 @rjmart/ui）：
 * - 框内直接输入过滤（适用选项多、文字长的场景）；
 * - 退格逐字删除：已选中时把标签转为可编辑文本逐字删，删空/未选时编辑搜索文字；
 * - 键盘操作：↑/↓ 移动高亮选项（面板未打开时按 ↓ 展开），Enter 选中高亮项，Escape 关闭；
 * - 鼠标 hover 高亮、点击选中；支持清除按钮与 FormData 提交（name）。
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "请选择",
  name,
  disabled = false,
  className = "",
}: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? "",
    [options, value],
  );
  // 已选且未处于编辑态时输入框回显标签；一旦退格/输入即进入编辑态（searchText）
  const inputValue = searchText !== "" || value === null ? searchText : selectedLabel;

  const filteredOptions = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [options, searchText]);

  // 面板定位与外部点击/Escape 关闭
  useEffect(() => {
    if (!open) return;
    const trigger = rootRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPanelPos({ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 228) });
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
  }, [open]);

  const commitSelection = (next: string) => {
    onChange(next);
    setSearchText("");
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setActiveIndex(0);
        setOpen(true);
        return;
      }
      if (!filteredOptions.length) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + delta + filteredOptions.length) % filteredOptions.length);
      return;
    }
    if (event.key === "Enter") {
      if (!open || activeIndex < 0 || !filteredOptions[activeIndex]) return;
      event.preventDefault();
      commitSelection(filteredOptions[activeIndex].value);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      // 已选中且尚未进入编辑态：把标签转为可编辑文本并删掉末尾一字，继续退格即逐字删除
      if (value && searchText === "") {
        event.preventDefault();
        onChange("");
        setSearchText(selectedLabel.slice(0, -1));
      }
      return;
    }
  };

  const handleBlur = () => {
    // 失焦时若编辑中的文字与已选标签不一致，回退为已选标签显示
    if (value && searchText !== "" && searchText !== selectedLabel) {
      setSearchText("");
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <div className={`${TRIGGER_CLASS} ${disabled ? "cursor-not-allowed bg-[#F5F5F5]" : ""}`}>
        <input
          value={inputValue}
          disabled={disabled}
          placeholder={value === null ? placeholder : undefined}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setSearchText(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={`min-w-0 flex-1 bg-transparent text-[rgba(0,0,0,0.85)] outline-none placeholder:text-[#BDBDBD] ${
            disabled ? "cursor-not-allowed text-[rgba(0,0,0,0.25)]" : ""
          }`}
        />
        {value && !disabled ? (
          <button
            type="button"
            aria-label="清除"
            onClick={() => {
              onChange("");
              setSearchText("");
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[rgba(0,0,0,0.25)] hover:text-[rgba(0,0,0,0.65)]"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[rgba(0,0,0,0.25)] ${open ? "rotate-180 text-[#3069F9]" : ""}`} />
      </div>
      {open && panelPos
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[70] overflow-hidden rounded-lg bg-white"
              style={{ left: panelPos.left, top: panelPos.top, width: panelPos.width, boxShadow: PANEL_SHADOW }}
            >
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto p-1.5">
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-[#BDBDBD]">无匹配选项</div>
                ) : (
                  filteredOptions.map((option, index) => {
                    const selected = option.value === value;
                    const active = index === activeIndex;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => commitSelection(option.value)}
                        className={`flex h-8 items-center rounded-md px-3 text-left text-sm ${
                          active ? "bg-[#E8F2FF] text-[#181818]" : "text-[rgba(0,0,0,0.65)]"
                        } ${selected ? "font-medium" : ""}`}
                      >
                        <span className="truncate">{option.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
