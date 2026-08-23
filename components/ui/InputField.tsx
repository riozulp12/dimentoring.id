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
import SelectField from "./SelectField";
import {
  FIELD_BASE,
  FIELD_SIZES,
  ICONS,
  ICON_SIZES,
  fieldTone,
  type InputFieldSize,
  type InputFieldStatus,
} from "./inputFieldStyles";

export type { InputFieldSize, InputFieldStatus };

interface BaseFieldProps {
  status?: InputFieldStatus;
  size?: InputFieldSize;
  className?: string;
}

export interface TextInputFieldProps
  extends BaseFieldProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  type: "text";
}

export interface PasswordInputFieldProps
  extends BaseFieldProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  type: "password";
}

export interface DropdownInputFieldProps
  extends BaseFieldProps,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "size"> {
  type: "dropdown";
  options: { label: string; value: string }[];
  placeholder?: string;
}

export interface FileInputFieldProps
  extends BaseFieldProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value" | "size"> {
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

function DropdownInput({ type: _type, ...props }: DropdownInputFieldProps) {
  void _type;
  // Tampilan custom (panel gaya dropdown Navbar) — lihat components/ui/SelectField.tsx.
  // Prop di sini identik dengan DropdownInputFieldProps minus `type`, jadi semua
  // pemakaian <InputField type="dropdown" .../> yang sudah ada tidak perlu berubah.
  return <SelectField {...props} />;
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
  size: _size,
  ...props
}: FileInputFieldProps) {
  void _type;
  void _size;
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
