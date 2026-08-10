"use client";

import Image from "next/image";
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";

export type InputFieldStatus = "default" | "success" | "error";
export type InputFieldSize = "md" | "lg";

const ICONS = {
  eye: { src: "/icons/input-eye.svg", size: 32 },
  chevronDown: { src: "/icons/input-chevron-down.svg", size: 24 },
  upload: { src: "/icons/input-upload.svg", size: 32 },
} as const;

const ICON_SIZES: Record<InputFieldSize, { eye: number; chevronDown: number }> = {
  md: { eye: 22, chevronDown: 20 },
  lg: { eye: 32, chevronDown: 24 },
};

const FIELD_BASE =
  "w-full border flex items-center font-normal leading-[1.5] tracking-[-0.02em] transition-colors";

const FIELD_SIZES: Record<InputFieldSize, string> = {
  md: "rounded-[16px] px-4 py-2.5 sm:px-5 sm:py-3 gap-2.5 sm:gap-3 text-sm sm:text-base",
  lg: "rounded-[20px] px-5 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5 gap-3 sm:gap-4 lg:gap-5 text-base sm:text-lg lg:text-xl",
};

function fieldTone(status: InputFieldStatus, disabled?: boolean) {
  if (disabled) {
    return "bg-[#F9F9F9] border-[#AFAFAF] text-[#7E7C7C] cursor-not-allowed";
  }
  if (status === "error") {
    return "bg-[#FFEBEB] border-[#E70A0A] text-[#E70A0A]";
  }
  if (status === "success") {
    return "bg-white border-[#0CBA00] text-[#7E7C7C]";
  }
  return "bg-white border-[#AFAFAF] text-[#7E7C7C] hover:border-[#081EEA] focus-within:border-black focus-within:text-black";
}

interface BaseFieldProps {
  status?: InputFieldStatus;
  size?: InputFieldSize;
  className?: string;
}

export interface TextInputFieldProps
  extends BaseFieldProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  type: "text";
}

export interface PasswordInputFieldProps
  extends BaseFieldProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  type: "password";
}

export interface DropdownInputFieldProps
  extends BaseFieldProps,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  type: "dropdown";
  options: { label: string; value: string }[];
  placeholder?: string;
}

export interface FileInputFieldProps
  extends BaseFieldProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  type: "file";
  helperText?: string;
  errorText?: string;
  onFilesSelected?: (files: FileList | null) => void;
}

export type InputFieldProps =
  | TextInputFieldProps
  | PasswordInputFieldProps
  | DropdownInputFieldProps
  | FileInputFieldProps;

function TextInput({
  status = "default",
  size = "lg",
  disabled,
  className,
  id,
  type: _type,
  ...props
}: TextInputFieldProps) {
  void _type;
  const autoId = useId();
  return (
    <div
      className={[FIELD_BASE, FIELD_SIZES[size], fieldTone(status, disabled), className]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        id={id ?? autoId}
        type="text"
        disabled={disabled}
        className="w-full bg-transparent outline-none border-none text-inherit placeholder:text-inherit"
        {...props}
      />
    </div>
  );
}

function PasswordInput({
  status = "default",
  size = "lg",
  disabled,
  className,
  id,
  type: _type,
  ...props
}: PasswordInputFieldProps) {
  void _type;
  const autoId = useId();
  const [visible, setVisible] = useState(false);
  const eyeSize = ICON_SIZES[size].eye;

  return (
    <div
      className={[FIELD_BASE, FIELD_SIZES[size], "justify-between", fieldTone(status, disabled), className]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        id={id ?? autoId}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className="w-full bg-transparent outline-none border-none text-inherit placeholder:text-inherit"
        {...props}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="shrink-0 disabled:cursor-not-allowed"
      >
        <Image
          src={ICONS.eye.src}
          width={eyeSize}
          height={eyeSize}
          alt=""
          className={visible ? "" : "opacity-50"}
        />
      </button>
    </div>
  );
}

function DropdownInput({
  status = "default",
  size = "lg",
  disabled,
  className,
  id,
  options,
  placeholder,
  ...props
}: DropdownInputFieldProps) {
  const autoId = useId();
  const chevronSize = ICON_SIZES[size].chevronDown;

  return (
    <div
      className={[FIELD_BASE, FIELD_SIZES[size], "justify-between", fieldTone(status, disabled), className]
        .filter(Boolean)
        .join(" ")}
    >
      <select
        id={id ?? autoId}
        disabled={disabled}
        className="w-full appearance-none bg-transparent outline-none border-none text-inherit"
        {...props}
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
      <Image
        src={ICONS.chevronDown.src}
        width={chevronSize}
        height={chevronSize}
        alt=""
        className="pointer-events-none shrink-0"
      />
    </div>
  );
}

function FileInput({
  status = "default",
  disabled,
  className,
  id,
  helperText = "Max size: 5GB",
  errorText = "Max file size: 5GB",
  onFilesSelected,
  type: _type,
  ...props
}: FileInputFieldProps) {
  void _type;
  const autoId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const dropzoneTone = disabled
    ? "bg-[#F9F9F9] border-[#AFAFAF] cursor-not-allowed"
    : status === "error"
      ? "bg-[#FFEBEB] border-[#E70A0A] cursor-pointer"
      : dragActive
        ? "bg-white border-[#081EEA] cursor-pointer"
        : "bg-white border-[#AFAFAF] hover:border-[#081EEA] cursor-pointer";

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className="w-full flex flex-col gap-2.5">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (!disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragActive(false);
          if (!disabled) onFilesSelected?.(event.dataTransfer.files);
        }}
        className={[
          "w-full rounded-[6px] border border-dashed py-3 flex flex-col items-center justify-center gap-2.5 transition-colors",
          dropzoneTone,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Image
          src={ICONS.upload.src}
          width={ICONS.upload.size}
          height={ICONS.upload.size}
          alt=""
        />
        <p className="text-lg font-normal leading-[1.5] tracking-[-0.02em]">
          <span className="text-[#7E7C7C]">Drop here to attach or</span>{" "}
          <span className="text-[#081EEA]">upload</span>
        </p>
        <p className="text-lg font-normal leading-[1.5] tracking-[-0.02em] text-[#7E7C7C]">
          {helperText}
        </p>
        <input
          ref={inputRef}
          id={id ?? autoId}
          type="file"
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onFilesSelected?.(event.target.files)
          }
          className="hidden"
          {...props}
        />
      </div>
      {status === "error" ? (
        <p className="w-full text-lg leading-5 tracking-[-0.02em] text-[#DC2626]">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

export default function InputField(props: InputFieldProps) {
  switch (props.type) {
    case "text":
      return <TextInput {...props} />;
    case "password":
      return <PasswordInput {...props} />;
    case "dropdown":
      return <DropdownInput {...props} />;
    case "file":
      return <FileInput {...props} />;
  }
}
