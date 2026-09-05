"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type SelectHTMLAttributes } from "react";
import Dropdown from "./Dropdown";
import {
  FIELD_BASE,
  FIELD_SIZES,
  ICONS,
  ICON_SIZES,
  fieldTone,
  type InputFieldSize,
  type InputFieldStatus,
} from "./inputFieldStyles";

export interface SearchableSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "size"> {
  status?: InputFieldStatus;
  size?: InputFieldSize;
  className?: string;
  options: { label: string; value: string }[];
  placeholder?: string;
  /** Placeholder input pencarian di dalam panel. Default: "Cari...". */
  searchPlaceholder?: string;
  /** Teks saat tidak ada opsi yang cocok dengan pencarian. Default: "Tidak ditemukan". */
  notFoundText?: string;
}

/**
 * Combobox dengan search — trigger box SAMA gaya & lebarnya dengan
 * SelectField (FIELD_BASE/FIELD_SIZES/fieldTone, lebar fixed ikut trigger via
 * Dropdown widthMode="match-trigger"), tapi panelnya punya input teks di atas
 * daftar opsi untuk filter substring case-insensitive real-time. Dipakai
 * pertama kali di Widget Cek Keketatan (PRD 7.4.5) karena datanya sudah
 * ratusan universitas/jurusan — <select> polos/SelectField tanpa search tidak
 * praktis lagi di skala itu.
 *
 * Reusable di form lain juga: tetap render <select> asli tersembunyi (pola
 * sama seperti SelectField) supaya `required`/`name`/constraint validation
 * native tetap jalan kalau dipakai di dalam <form>.
 */
export default function SearchableSelect({
  id,
  name,
  status = "default",
  size = "lg",
  className,
  disabled,
  required,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Cari...",
  notFoundText = "Tidak ditemukan",
  ...rest
}: SearchableSelectProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const chevronSize = ICON_SIZES[size].chevronDown;

  const currentValue = typeof value === "string" ? value : "";
  const selectedOption = options.find((option) => option.value === currentValue);
  const displayLabel = selectedOption?.label ?? (placeholder ? undefined : options[0]?.label);

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  useEffect(() => {
    // Fokus input pencarian tiap kali panel dibuka — sesuai perilaku
    // combobox yang diminta (klik dropdown -> langsung bisa ketik).
    if (open) searchInputRef.current?.focus();
  }, [open]);

  function handleOpenChange(next: boolean) {
    setOpen(disabled ? false : next);
    // Reset pencarian & highlight tiap kali panel dibuka/ditutup, supaya
    // buka lagi selalu mulai dari daftar penuh (bukan filter sebelumnya).
    setQuery("");
    setHighlightedIndex(0);
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setHighlightedIndex(0);
  }

  function selectOption(optionValue: string) {
    handleOpenChange(false);
    if (optionValue === currentValue) return;
    onChange?.({ target: { value: optionValue, name } } as unknown as ChangeEvent<HTMLSelectElement>);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = filteredOptions[highlightedIndex];
      if (target) selectOption(target.value);
    }
  }

  return (
    <Dropdown
      open={open}
      onOpenChange={handleOpenChange}
      widthMode="match-trigger"
      panelRole="listbox"
      panelClassName="max-h-72 overflow-y-auto p-0"
      className={className}
      trigger={
        <>
          <button
            type="button"
            id={fieldId}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => !disabled && handleOpenChange(!open)}
            className={[FIELD_BASE, FIELD_SIZES[size], "justify-between", fieldTone(status, disabled), className]
              .filter(Boolean)
              .join(" ")}
          >
            <span className={`truncate text-left ${displayLabel ? "" : "opacity-70"}`} title={displayLabel}>
              {displayLabel ?? placeholder ?? ""}
            </span>
            <Image
              src={ICONS.chevronDown.src}
              width={chevronSize}
              height={chevronSize}
              alt=""
              className={`pointer-events-none shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            />
          </button>
          {/* Select asli tersembunyi — jaga required/name/constraint validation, lihat docblock di atas. */}
          <select
            aria-hidden="true"
            tabIndex={-1}
            name={name}
            value={currentValue}
            required={required}
            disabled={disabled}
            onChange={() => {}}
            className="pointer-events-none absolute inset-0 h-full w-full cursor-default opacity-0"
            {...rest}
          >
            {placeholder ? (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            ) : null}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      }
    >
      <div className="sticky top-0 z-10 border-b border-[#E3E3E3] bg-white p-2">
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          placeholder={searchPlaceholder}
          className="w-full rounded-[10px] border border-[#AFAFAF] px-3 py-2 text-sm text-black outline-none focus:border-[#081EEA]"
        />
      </div>
      {filteredOptions.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[#7E7C7C]">{notFoundText}</p>
      ) : (
        filteredOptions.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="option"
            title={option.label}
            aria-selected={option.value === currentValue}
            onMouseEnter={() => setHighlightedIndex(index)}
            onClick={() => selectOption(option.value)}
            className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors ${
              index === highlightedIndex ? "bg-gray-50" : ""
            } ${option.value === currentValue ? "font-medium text-[#081EEA]" : "text-black"}`}
          >
            <span className="block truncate">{option.label}</span>
          </button>
        ))
      )}
    </Dropdown>
  );
}
