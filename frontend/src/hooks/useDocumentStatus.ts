import { useEffect, useRef, useState } from "react";

import { listDocuments } from "@/api/documents";
import { IN_PROGRESS_DOCUMENT_STATUSES, type CompanyDocument } from "@/types/document";

const DOCUMENT_POLL_INTERVAL_MS = 4000;

export function useDocumentStatus(companyId: string | undefined) {
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const processingStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    listDocuments(companyId)
      .then((docs) => {
        if (cancelled) return;
        setDocuments(docs);
        setDocumentsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setDocumentsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const isProcessing = documents.some((doc) => IN_PROGRESS_DOCUMENT_STATUSES.includes(doc.status));

  // Auto-refresh while extraction is in progress; stops as soon as no document is
  // still pending/processing.
  useEffect(() => {
    if (!companyId || !isProcessing) return;
    const interval = setInterval(() => {
      listDocuments(companyId)
        .then(setDocuments)
        .catch(() => undefined);
    }, DOCUMENT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [companyId, isProcessing]);

  useEffect(() => {
    if (isProcessing) {
      if (processingStartedAtRef.current === null) {
        processingStartedAtRef.current = Date.now();
      }
    } else {
      processingStartedAtRef.current = null;
    }
  }, [isProcessing]);

  const elapsedMs = processingStartedAtRef.current ? Date.now() - processingStartedAtRef.current : 0;

  return { documents, documentsLoaded, isProcessing, elapsedMs };
}
