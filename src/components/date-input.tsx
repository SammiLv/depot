"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue"> & {
  defaultValue?: Date | string | null;
};

type DateParts = { year: string; month: string; day: string };

function pad2(value: string) {
  return value.padStart(2, "0");
}

function parseDateParts(value: Date | string | null | undefined): DateParts {
  if (!value) return { year: "", month: "", day: "" };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { year: "", month: "", day: "" };
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    day: String(date.getDate()).padStart(2, "0"),
  };
}

function buildIsoDate(parts: DateParts) {
  if (parts.year.length !== 4 || parts.month.length !== 2 || parts.day.length !== 2) return "";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeDigits(raw: string, maxLength: number) {
  return raw.replace(/\D/g, "").slice(0, maxLength);
}

function segmentInputClassName() {
  return "min-w-0 border-0 bg-transparent p-0 text-center text-sm outline-none focus:ring-0";
}

function normalizeMonthDigits(digits: string) {
  if (digits.length <= 1) return digits;
  const num = Number(digits);
  if (num >= 1 && num <= 12) return pad2(String(num));
  return digits.slice(0, 1);
}

function normalizeDayDigits(digits: string, year: string, month: string) {
  if (digits.length <= 1) return digits;
  const num = Number(digits);
  const maxDay = getMaxDayInMonth(year, month);
  if (num >= 1 && num <= maxDay) return pad2(String(num));
  return digits.slice(0, 1);
}

function getMaxDayInMonth(year: string, month: string) {
  if (year.length !== 4 || month.length !== 2) return 31;
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 31;
  return new Date(y, m, 0).getDate();
}

export function DateInput({
  name,
  defaultValue,
  required,
  className = "",
  disabled,
  id,
  onFocus,
  onBlur,
}: DateInputProps) {
  const pickerId = useId();
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [parts, setParts] = useState<DateParts>(() => parseDateParts(defaultValue));
  const isoValue = buildIsoDate(parts);

  useEffect(() => {
    setParts(parseDateParts(defaultValue));
  }, [defaultValue]);

  const focusMonth = () => {
    monthRef.current?.focus();
  };

  const focusDay = () => {
    dayRef.current?.focus();
  };

  const handleYearChange = (raw: string) => {
    const year = normalizeDigits(raw, 4);
    setParts((current) => ({ ...current, year }));
    if (year.length === 4) {
      window.setTimeout(focusMonth, 0);
    }
  };

  const handleMonthChange = (raw: string) => {
    const digits = normalizeDigits(raw, 2);
    if (digits.length === 0) {
      setParts((current) => ({ ...current, month: "" }));
      return;
    }

    if (digits.length === 1) {
      const num = Number(digits);
      if (num >= 2 && num <= 9) {
        setParts((current) => ({ ...current, month: pad2(digits) }));
        window.setTimeout(focusDay, 0);
        return;
      }
      setParts((current) => ({ ...current, month: digits }));
      return;
    }

    const month = normalizeMonthDigits(digits);
    setParts((current) => ({ ...current, month }));
    if (month.length === 2) {
      window.setTimeout(focusDay, 0);
    }
  };

  const handleDayChange = (raw: string) => {
    const digits = normalizeDigits(raw, 2);
    if (digits.length === 0) {
      setParts((current) => ({ ...current, day: "" }));
      return;
    }

    if (digits.length === 1) {
      const num = Number(digits);
      if (num >= 4 && num <= 9) {
        setParts((current) => ({ ...current, day: pad2(digits) }));
        return;
      }
      setParts((current) => ({ ...current, day: digits }));
      return;
    }

    setParts((current) => ({
      ...current,
      day: normalizeDayDigits(digits, current.year, current.month),
    }));
  };

  const padMonthOnBlur = () => {
    setParts((current) => {
      if (current.month.length !== 1) return current;
      const num = Number(current.month);
      if (num >= 1 && num <= 9) {
        return { ...current, month: pad2(current.month) };
      }
      return current;
    });
  };

  const padDayOnBlur = () => {
    setParts((current) => {
      if (current.day.length !== 1) return current;
      const num = Number(current.day);
      const maxDay = getMaxDayInMonth(current.year, current.month);
      if (num >= 1 && num <= Math.min(9, maxDay)) {
        return { ...current, day: pad2(current.day) };
      }
      return current;
    });
  };

  const handlePickerChange = (value: string) => {
    setParts(parseDateParts(value));
  };

  return (
    <div
      className={`flex items-center gap-1 focus-within:border-ring ${className}`}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="flex min-w-0 flex-1 items-center justify-start gap-1">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="年"
          placeholder="年"
          maxLength={4}
          disabled={disabled}
          value={parts.year}
          onChange={(event) => handleYearChange(event.target.value)}
          className={`${segmentInputClassName()} w-[4.5ch]`}
        />
        <span className="text-muted-foreground">/</span>
        <input
          ref={monthRef}
          type="text"
          inputMode="numeric"
          autoComplete="numeric"
          aria-label="月"
          placeholder="月"
          maxLength={2}
          disabled={disabled}
          value={parts.month}
          onChange={(event) => handleMonthChange(event.target.value)}
          onBlur={padMonthOnBlur}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !parts.month) {
              event.preventDefault();
              const yearInput = event.currentTarget.parentElement?.querySelector<HTMLInputElement>('input[aria-label="年"]');
              yearInput?.focus();
            }
          }}
          className={`${segmentInputClassName()} w-[3ch]`}
        />
        <span className="text-muted-foreground">/</span>
        <input
          ref={dayRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="日"
          placeholder="日"
          maxLength={2}
          disabled={disabled}
          value={parts.day}
          onChange={(event) => handleDayChange(event.target.value)}
          onBlur={padDayOnBlur}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !parts.day) {
              event.preventDefault();
              monthRef.current?.focus();
            }
          }}
          className={`${segmentInputClassName()} w-[3ch]`}
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        aria-label="打开日期选择器"
        className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
        onClick={() => {
          const picker = pickerRef.current;
          if (!picker) return;
          if (isoValue) picker.value = isoValue;
          picker.showPicker?.();
        }}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        id={pickerId}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        value={isoValue}
        onChange={(event) => handlePickerChange(event.target.value)}
      />
      {name ? <input type="hidden" name={name} value={isoValue} required={required} /> : null}
    </div>
  );
}
