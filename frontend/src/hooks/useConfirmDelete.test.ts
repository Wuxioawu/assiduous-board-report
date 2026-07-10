import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useConfirmDelete } from "@/hooks/useConfirmDelete";

describe("useConfirmDelete", () => {
  it("opens the confirmation with the requested item", () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useConfirmDelete(onDelete));

    act(() => {
      result.current.requestDelete({ id: "1" });
    });

    expect(result.current.pendingItem).toEqual({ id: "1" });
    expect(result.current.error).toBeNull();
  });

  it("clears the pending item and stays error-free after a successful delete", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useConfirmDelete(onDelete));

    act(() => {
      result.current.requestDelete({ id: "1" });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(onDelete).toHaveBeenCalledWith({ id: "1" });
    expect(result.current.pendingItem).toBeNull();
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the backend's error detail and keeps the modal open on failure", async () => {
    const onDelete = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Cannot delete: budget is referenced elsewhere" } },
    });
    const { result } = renderHook(() => useConfirmDelete(onDelete, "Failed to delete"));

    act(() => {
      result.current.requestDelete({ id: "1" });
    });
    await act(async () => {
      await result.current.confirm();
    });

    // Failure keeps the item pending so the modal stays open with the error shown,
    // rather than silently closing on the user.
    expect(result.current.pendingItem).toEqual({ id: "1" });
    expect(result.current.error).toBe("Cannot delete: budget is referenced elsewhere");
    expect(result.current.isDeleting).toBe(false);
  });

  it("falls back to the caller's message when the error has no backend detail", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("network blip"));
    const { result } = renderHook(() => useConfirmDelete(onDelete, "Failed to delete, please try again"));

    act(() => {
      result.current.requestDelete({ id: "1" });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.error).toBe("Failed to delete, please try again");
  });

  it("cancel() is a no-op while a delete is in flight", async () => {
    let resolveDelete: () => void = () => {};
    const onDelete = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const { result } = renderHook(() => useConfirmDelete(onDelete));

    act(() => {
      result.current.requestDelete({ id: "1" });
    });
    act(() => {
      result.current.confirm();
    });
    await waitFor(() => expect(result.current.isDeleting).toBe(true));

    act(() => {
      result.current.cancel();
    });
    // Still pending/deleting - cancel() must not yank the modal away mid-request.
    expect(result.current.pendingItem).toEqual({ id: "1" });
    expect(result.current.isDeleting).toBe(true);

    await act(async () => {
      resolveDelete();
      await Promise.resolve();
    });
  });
});
