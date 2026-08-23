"use client";

import Image from "next/image";
import { useId, useState, type ChangeEvent, type SelectHTMLAttributes } from "react";
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

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "size"> {
  status?: InputFieldStatus;
  size?: InputFieldSize;
  className?: string;
  options: { label: string; value: string }[];
  placeholder?: string;
}

/**
 * Select custom bergaya SAMA dengan dropdown avatar/notifikasi Navbar (lihat
 * components/ui/Dropdown.tsx) — panel opsi rounded-[16px]/border/shadow/hover
 * per baris, lebar panel PERSIS selebar trigger (widthMode="match-trigger",
 * beda dari dropdown Navbar yang lebarnya fixed).
 *
 * REVISI DESAIN MURNI: kotak trigger tetap identik dengan InputField lain
 * (FIELD_BASE/FIELD_SIZES/fieldTone, dari inputFieldStyles.ts) — cuma cara
 * nampilin daftar opsi yang diganti dari <select> native ke panel custom.
 *
 * Tetap render <select> ASLI (tersembunyi via opacity-0, BUKAN display:none
 * supaya tidak "barred from constraint validation") yang disinkronkan lewat
 * value/onChange/required/name yang SAMA — inilah yang menjaga `required` dan
 * validasi submit form tetap berfungsi persis seperti <select> native
 * sebelumnya walau tampilannya sudah custom (beberapa form di project ini
 * — mis. Kelola Kelas, Kelola Assessment — MURNI mengandalkan required native
 * ini, tidak ada pengecekan kosong terpisah di JS-nya).
 */
export default function SelectField({
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
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const chevronSize = ICON_SIZES[size].chevronDown;

  const currentValue = typeof value === "string" ? value : "";
  const selectedOption = options.find((option) => option.value === currentValue);
  const displayLabel = selectedOption?.label ?? (placeholder ? undefined : options[0]?.label);

  function selectOption(optionValue: string) {
    setOpen(false);
    if (optionValue === currentValue) return;
    onChange?.({ target: { value: optionValue, name } } as unknown as ChangeEvent<HTMLSelectElement>);
  }

  return (
    <Dropdown
      open={open}
      onOpenChange={(next) => setOpen(disabled ? false : next)}
      widthMode="match-trigger"
      panelRole="listbox"
      panelClassName="max-h-64 overflow-y-auto"
      className={className}
      trigger={
        <>
          <button
            type="button"
            id={fieldId}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => !disabled && setOpen((prev) => !prev)}
            className={[FIELD_BASE, FIELD_SIZES[size], "justify-between", fieldTone(status, disabled), className]
              .filter(Boolean)
              .join(" ")}
          >
            <span className={`truncate text-left ${displayLabel ? "" : "opacity-70"}`}>
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
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === currentValue}
          onClick={() => selectOption(option.value)}
          className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 ${
            option.value === currentValue ? "font-medium text-[#081EEA]" : "text-black"
          }`}
        >
          {option.label}
        </button>
      ))}
    </Dropdown>
  );
}
