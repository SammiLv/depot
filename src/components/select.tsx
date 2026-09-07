"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_MAX_WIDTH = 380;
const MENU_ITEM_X_PADDING = 28;
const MENU_VIEWPORT_MARGIN = 16;
const MENU_OFFSET_Y = 4;
const dropdownPanelEnterClass = "dropdown-panel-enter";
const dropdownPanelEnterBodyClass = "dropdown-panel-enter-body";

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  width?: 96 | 112 | 128 | 228;
  placeholderMuted?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  variant?: "default" | "plain";
  trigger?: "input" | "button";
  className?: string;
};

const widthClassName: Record<NonNullable<SelectProps["width"]>, string> = {
  96: "w-[96px]",
  112: "w-[112px]",
  128: "w-[128px]",
  228: "w-[228px]",
};

function measureMenuWidth(labels: string[], minWidth: number) {
  const maxAllowed = Math.min(
    MENU_MAX_WIDTH,
    typeof window === "undefined" ? MENU_MAX_WIDTH : window.innerWidth - MENU_VIEWPORT_MARGIN * 2,
  );
  if (typeof document === "undefined") {
    return Math.min(maxAllowed, Math.max(minWidth, 128));
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return Math.min(maxAllowed, Math.max(minWidth, 128));
  }
  context.font = `14px ${getComputedStyle(document.body).fontFamily}`;
  let contentWidth = 0;
  for (const label of labels) {
    contentWidth = Math.max(contentWidth, context.measureText(label).width);
  }
  return Math.min(maxAllowed, Math.max(minWidth, Math.ceil(contentWidth + MENU_ITEM_X_PADDING)));
}

export function Select({
  width = 128,
  value,
  options,
  placeholderMuted,
  searchable,
  searchPlaceholder,
  variant = "default",
  trigger = "input",
  className,
  onChange,
}: SelectProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0] ?? null;
  const isPlaceholder = Boolean(placeholderMuted && !value);
  const plain = variant === "plain";
  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query, searchable]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      setQuery("");
      return;
    }

    const updatePosition = () => {
      const anchor = wrapperRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const minWidth = Math.max(rect.width, searchable ? 228 : 0);
      const menuWidth = measureMenuWidth(filteredOptions.map((option) => option.label), minWidth);
      const maxLeft = window.innerWidth - MENU_VIEWPORT_MARGIN - menuWidth;
      const left = Math.max(MENU_VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));

      setMenuPosition({
        top: rect.bottom + MENU_OFFSET_Y,
        left,
        width: menuWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [filteredOptions, open, searchable]);

  useEffect(() => {
    if (!open || !searchable) return;
    searchInputRef.current?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const menu = open && menuPosition ? (
    <div
      ref={menuRef}
      id={listboxId}
      role="listbox"
      style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
      className={`fixed z-50 ${dropdownPanelEnterClass}`}
    >
      <div
        className={`${dropdownPanelEnterBodyClass} flex flex-col rounded-lg bg-white p-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.12)] ${
          searchable ? "max-h-80" : "max-h-64"
        }`}
      >
        {searchable ? (
          <div className="mb-0.5 flex h-8 shrink-0 items-center gap-2 rounded-md bg-[#F5F7F9] px-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#777777]" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder ?? "搜索"}
              className="min-w-0 flex-1 bg-transparent text-sm leading-[22px] text-[#181818] outline-none placeholder:text-[#BDBDBD]"
            />
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {filteredOptions.length ? (
            filteredOptions.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__empty"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex h-8 min-h-8 w-full shrink-0 items-center overflow-hidden rounded-md px-2 py-0 text-left text-sm leading-[22px] hover:bg-[#F5F5F5] ${
                    active ? "bg-[#F5F5F5] text-[#181818]" : "bg-transparent text-[#181818]"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })
          ) : (
            <div className="flex h-8 shrink-0 items-center px-2 text-sm leading-[22px] text-[#777777]">未找到匹配项</div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const toggleOpen = () => setOpen((current) => !current);
  const triggerClassName = plain
    ? `h-8 w-full cursor-pointer truncate rounded-md text-left text-sm outline-none bg-[#F5F7F9] px-2 pr-7 ${value ? "text-[#181818]" : "text-[#777777]"}`
    : `h-8 w-full cursor-pointer truncate rounded-md text-left text-sm outline-none border border-[#F0F0F0] bg-[#FAFAFA] pl-3 pr-9 ${isPlaceholder ? "text-[#777777]" : "text-[#181818]"}`;

  return (
    <div ref={wrapperRef} className={`relative h-8 ${widthClassName[width]} ${className ?? ""}`}>
      {trigger === "input" ? (
        <input
          type="text"
          readOnly
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          value={selectedOption?.label ?? ""}
          onClick={toggleOpen}
          className={triggerClassName}
        />
      ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          onClick={toggleOpen}
          className={`flex items-center ${triggerClassName}`}
        >
          <span className="truncate">{selectedOption?.label ?? ""}</span>
        </button>
      )}
      <ChevronDown
        className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[#4B4B4B] transition-transform duration-200 ${
          plain ? "right-2" : "right-3"
        } ${open ? "rotate-180" : ""}`}
      />
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}
