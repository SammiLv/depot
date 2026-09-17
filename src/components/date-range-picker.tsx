"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// 公司设计规范（MasterGo: TimePicker时间选择框 / DatePicker）:
//   主色 #3069F9 / 悬停底色 #E8F2FF / 边框 #D9D9D9 / 占位 #BDBDBD
//   面板阴影 0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08), 0 9px 28px 8px rgba(0,0,0,.05)
//   双月面板，星期头 日一二三四五六，选中端点实色、区间内浅蓝

type DateRangePickerProps = {
  nameStart: string;
  nameEnd: string;
  defaultStart?: Date | string | null;
  defaultEnd?: Date | string | null;
  disabled?: boolean;
  className?: string;
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function fromIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(a: Date | null, b: Date | null) {
  return Boolean(a && b) && toIsoDate(a) === toIsoDate(b);
}

function addMonths(base: Date, offset: number) {
  return new Date(base.getFullYear(), base.getMonth() + offset, 1);
}

function buildMonthCells(anchor: Date): Array<Date | null> {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(anchor.getFullYear(), anchor.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DateRangePicker({
  nameStart,
  nameEnd,
  defaultStart,
  defaultEnd,
  disabled,
  className = "",
}: DateRangePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [startIso, setStartIso] = useState(() => toIsoDate(defaultStart));
  const [endIso, setEndIso] = useState(() => toIsoDate(defaultEnd));
  const [panelMonth, setPanelMonth] = useState(() => fromIsoDate(toIsoDate(defaultStart)) ?? new Date());

  useEffect(() => {
    setStartIso(toIsoDate(defaultStart));
    setEndIso(toIsoDate(defaultEnd));
  }, [defaultStart, defaultEnd]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  const startDate = fromIsoDate(startIso);
  const endDate = fromIsoDate(endIso);
  const todayIso = toIsoDate(new Date());

  const months = useMemo(() => {
    const left = new Date(panelMonth.getFullYear(), panelMonth.getMonth(), 1);
    return [left, addMonths(left, 1)];
  }, [panelMonth]);

  const pickDay = (day: Date) => {
    const iso = toIsoDate(day);
    // 都未选 / 都已选 → 重新开始选；只选了开始 → 定结束（早于开始则自动交换）
    if ((!startIso && !endIso) || (startIso && endIso)) {
      setStartIso(iso);
      setEndIso("");
      return;
    }
    if (startIso && !endIso) {
      if (iso < startIso) {
        setEndIso(startIso);
        setStartIso(iso);
      } else {
        setEndIso(iso);
      }
      setOpen(false);
    }
  };

  const cellClass = (day: Date) => {
    const iso = toIsoDate(day);
    const isStart = iso === startIso;
    const isEnd = iso === endIso;
    if (isStart || isEnd) {
      return "bg-[#3069F9] text-white font-medium";
    }
    const inRange = startIso && endIso && iso > startIso && iso < endIso;
    if (inRange) {
      return "bg-[#E8F2FF] text-[#181818]";
    }
    return "text-[rgba(0,0,0,0.88)] hover:bg-[#F5F5F5]";
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input type="hidden" name={nameStart} value={startIso} />
      <input type="hidden" name={nameEnd} value={endIso} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open && startDate) setPanelMonth(startDate);
          setOpen((current) => !current);
        }}
        className={`flex h-10 w-full items-center gap-2 rounded-lg border bg-background px-3 text-sm transition-colors disabled:opacity-50 ${
          open ? "border-[#3069F9]" : "border-[#D9D9D9] hover:border-[#3069F9]"
        }`}
      >
        <span className={`flex-1 text-left ${startIso ? "text-[rgba(0,0,0,0.88)]" : "text-[#BDBDBD]"}`}>
          {startIso || "开始时间"}
        </span>
        <span className="h-px w-2 bg-[#BDBDBD]" aria-hidden="true" />
        <span className={`flex-1 text-left ${endIso ? "text-[rgba(0,0,0,0.88)]" : "text-[#BDBDBD]"}`}>
          {endIso || "结束时间"}
        </span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[rgba(0,0,0,0.45)]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 flex gap-4 rounded-lg border border-[#F0F0F0] bg-white p-3 shadow-[0_3px_6px_-4px_rgba(0,0,0,0.12),0_6px_16px_0_rgba(0,0,0,0.08),0_9px_28px_8px_rgba(0,0,0,0.05)]">
          {months.map((month, index) => (
            <div key={`${month.getFullYear()}-${month.getMonth()}`} className="w-[232px]">
              <div className="mb-2 flex h-6 items-center justify-between px-1">
                {index === 0 ? (
                  <button
                    type="button"
                    aria-label="上一月"
                    onClick={() => setPanelMonth((current) => addMonths(current, -1))}
                    className="flex h-5 w-5 items-center justify-center rounded text-[#4B4B4B] hover:bg-[#F5F5F5]"
                  >
                    ‹
                  </button>
                ) : (
                  <span className="w-5" />
                )}
                <span className="text-sm font-medium text-[rgba(0,0,0,0.88)]">
                  {month.getFullYear()}年 {month.getMonth() + 1}月
                </span>
                {index === 1 ? (
                  <button
                    type="button"
                    aria-label="下一月"
                    onClick={() => setPanelMonth((current) => addMonths(current, 1))}
                    className="flex h-5 w-5 items-center justify-center rounded text-[#4B4B4B] hover:bg-[#F5F5F5]"
                  >
                    ›
                  </button>
                ) : (
                  <span className="w-5" />
                )}
              </div>
              <div className="grid grid-cols-7 text-center text-xs leading-6 text-[#4B4B4B]">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5 text-center">
                {buildMonthCells(month).map((day, cellIndex) =>
                  day ? (
                    <button
                      key={cellIndex}
                      type="button"
                      onClick={() => pickDay(day)}
                      className={`mx-auto flex h-6 w-6 items-center justify-center rounded text-xs leading-6 ${cellClass(day)} ${
                        toIsoDate(day) === todayIso && toIsoDate(day) !== startIso && toIsoDate(day) !== endIso
                          ? "ring-1 ring-inset ring-[#3069F9]"
                          : ""
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  ) : (
                    <span key={cellIndex} className="h-6" />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
