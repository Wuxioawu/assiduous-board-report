import { apiClient } from "@/api/client";
import type { Audience } from "@/types/insight";

function extractFilename(contentDisposition: string | undefined, fallback: string): string {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const asciiMatch = contentDisposition.match(/filename="([^"]+)"/);
  return asciiMatch ? asciiMatch[1] : fallback;
}

export async function exportReportPdf(companyId: string, sections: Audience[], period?: string): Promise<void> {
  const response = await apiClient.post<Blob>(
    `/companies/${companyId}/export/pdf`,
    { sections, period },
    { responseType: "blob" },
  );
  const filename = extractFilename(response.headers["content-disposition"], "report.pdf");
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
