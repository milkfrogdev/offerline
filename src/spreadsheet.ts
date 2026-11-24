/**
 * 读取用户选中的本地表格/文本文件（.xlsx / .xls / .csv / .tsv / .txt / .md），
 * 对纯文本与 CSV 支持 UTF-8 / GB18030 自动回退，Excel 按需动态加载 SheetJS，不增加首屏包体。
 */
export async function readImportFileAsText(
  file: File,
): Promise<{ text: string; summary: string }> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();

  if (/\.(?:xlsx|xls)$/i.test(name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "array" });
    const sections: string[] = [];
    let totalRows = 0;

    for (const sheetName of wb.SheetNames.slice(0, 4)) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });
      const cleanRows = rows
        .map((r) => r.map((cell) => String(cell ?? "").replace(/[\r\n\t]+/g, " ").trim()))
        .filter((r) => r.some((cell) => cell !== ""));
      if (!cleanRows.length) continue;

      totalRows += cleanRows.length;
      const lines = cleanRows.map((r) => r.join("\t"));
      sections.push(
        wb.SheetNames.length > 1 ? `# 工作表: ${sheetName}\n${lines.join("\n")}` : lines.join("\n"),
      );
    }

    const joined = sections.join("\n\n").trim();
    if (!joined) {
      throw new Error("Excel 文件中未读取到有效数据行。");
    }
    const maxLen = 45_000;
    const clipped = joined.length > maxLen;
    return {
      text: clipped ? joined.slice(0, maxLen) : joined,
      summary: `已读取 ${file.name}（共 ${totalRows} 行${clipped ? "，已截取前 45000 字" : ""}）`,
    };
  }

  let decoded = "";
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    decoded = new TextDecoder("gb18030").decode(buf);
  }
  const cleanText = decoded.replace(/^\uFEFF/, "").trim();
  if (!cleanText) {
    throw new Error("文件内容为空。");
  }
  const lineCount = cleanText.split(/\r?\n/).filter((l) => l.trim()).length;
  const maxLen = 45_000;
  const clipped = cleanText.length > maxLen;
  return {
    text: clipped ? cleanText.slice(0, maxLen) : cleanText,
    summary: `已读取 ${file.name}（${lineCount} 行${clipped ? "，已截取前 45000 字" : ""}）`,
  };
}
