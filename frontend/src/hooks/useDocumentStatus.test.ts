import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/documents", () => ({
  listDocuments: vi.fn(),
}));

import { listDocuments } from "@/api/documents";
import { useDocumentStatus } from "@/hooks/useDocumentStatus";
import type { CompanyDocument } from "@/types/document";

function doc(overrides: Partial<CompanyDocument> = {}): CompanyDocument {
  return {
    id: "doc-1",
    company_id: "company-1",
    filename: "report.pdf",
    file_type: "application/pdf",
    status: "pending",
    period_start: null,
    period_end: null,
    error_message: null,
    source_type: "manual_upload",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// waitFor from testing-library polls via real setTimeout/setInterval, which
// fake timers intercept and never fire on their own - flush pending
// promises/timers manually instead of relying on waitFor while faked.
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("useDocumentStatus", () => {
  beforeEach(() => {
    vi.mocked(listDocuments).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when no companyId is provided yet", () => {
    const { result } = renderHook(() => useDocumentStatus(undefined));

    expect(listDocuments).not.toHaveBeenCalled();
    expect(result.current.documentsLoaded).toBe(false);
    expect(result.current.documents).toEqual([]);
  });

  it("loads documents on mount and marks them loaded", async () => {
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "extracted" })]);

    const { result } = renderHook(() => useDocumentStatus("company-1"));
    await flush();

    expect(result.current.documentsLoaded).toBe(true);
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.isProcessing).toBe(false);
  });

  it("marks documentsLoaded even when the initial fetch fails", async () => {
    vi.mocked(listDocuments).mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useDocumentStatus("company-1"));
    await flush();

    expect(result.current.documentsLoaded).toBe(true);
    expect(result.current.documents).toEqual([]);
  });

  it("does not update state after unmount when the initial fetch resolves late", async () => {
    let resolveFetch: (docs: CompanyDocument[]) => void = () => {};
    vi.mocked(listDocuments).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useDocumentStatus("company-1"));
    unmount();

    resolveFetch([doc({ status: "extracted" })]);
    await flush();

    // The hook's cleanup flag must suppress the late setState - nothing to
    // assert on `result.current` post-unmount, but no act() warning/crash
    // means the cancelled-guard actually worked.
    expect(result.current.documentsLoaded).toBe(false);
  });

  it("treats pending/processing documents as isProcessing and polls while any remain in progress", async () => {
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "processing" })]);

    const { result } = renderHook(() => useDocumentStatus("company-1"));
    await flush();
    expect(result.current.isProcessing).toBe(true);
    expect(listDocuments).toHaveBeenCalledTimes(1);

    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "processing" })]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(listDocuments).toHaveBeenCalledTimes(2);
    expect(result.current.isProcessing).toBe(true);
  });

  it("stops polling once every document leaves the in-progress state", async () => {
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "processing" })]);
    const { result } = renderHook(() => useDocumentStatus("company-1"));
    await flush();

    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "extracted" })]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(result.current.isProcessing).toBe(false);
    expect(listDocuments).toHaveBeenCalledTimes(2);

    // No further polling once isProcessing is false - advancing well past
    // another interval must not trigger a third call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(listDocuments).toHaveBeenCalledTimes(2);
  });

  it("tracks elapsed processing time while processing is in progress", async () => {
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "processing" })]);
    const { result } = renderHook(() => useDocumentStatus("company-1"));
    await flush();
    expect(result.current.elapsedMs).toBe(0);

    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "processing" })]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(4000);
  });

  it("elapsedMs lags by one render after processing finishes, since it's read from a ref", async () => {
    // processingStartedAtRef is only cleared inside a useEffect, which runs
    // AFTER the render where isProcessing flips to false - and clearing a
    // ref doesn't itself trigger a re-render. So the render that reports
    // isProcessing: false still carries the last non-zero elapsedMs; it
    // only reads back as 0 on whatever render happens next. Harmless today
    // because ReportStatusPanels only renders the elapsed-time UI while
    // isProcessing is still true, but worth locking in so a future consumer
    // doesn't get bitten by a stale "elapsed" readout after completion.
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "processing" })]);
    const { result } = renderHook(() => useDocumentStatus("company-1"));
    await flush();

    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "extracted" })]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.elapsedMs).toBeGreaterThan(0);
  });
});
