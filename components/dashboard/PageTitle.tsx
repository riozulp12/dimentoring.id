"use client";

import { useEffect } from "react";
import { usePageTitle } from "./pageTitleContext";

/**
 * Dipanggil oleh tiap page.tsx di dalam (protected)/ untuk menentukan judul
 * yang tampil di Header — Header sendiri cuma dirender sekali di
 * (protected)/layout.tsx, jadi judul dikirim lewat context ini, bukan lewat
 * prop langsung dari page ke Header.
 */
export default function PageTitle({ value }: { value: string }) {
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle(value);
  }, [value, setTitle]);

  return null;
}
