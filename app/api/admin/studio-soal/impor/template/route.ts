import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { buatDocx } from "@/lib/admin/docxZip";
import { buatTemplateCsv } from "@/lib/shared/studio-soal/impor";
import { paragrafTemplateDocx } from "@/lib/shared/studio-soal/imporDocx";

/** Unduh template (Admin): GET ?berkas=docx (contoh Word: 1 bacaan + 2 soal) | soal | bacaan (CSV v1, UTF-8 dengan BOM). */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const berkas = request.nextUrl.searchParams.get("berkas");
  if (berkas === "docx") {
    return new NextResponse(new Uint8Array(buatDocx(paragrafTemplateDocx())), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="template-soal.docx"',
        "Cache-Control": "no-store",
      },
    });
  }
  if (berkas !== "soal" && berkas !== "bacaan") {
    return NextResponse.json({ success: false, error: "Pilih berkas docx, soal, atau bacaan." }, { status: 400 });
  }
  const template = buatTemplateCsv();
  return new NextResponse(template[berkas], {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${berkas}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
