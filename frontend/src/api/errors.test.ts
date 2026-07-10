import { describe, expect, it } from "vitest";

import { classifyError, getErrorDetail } from "@/api/errors";

function axiosError(overrides: { response?: { status?: number; data?: unknown } } = {}) {
  return {
    isAxiosError: true,
    response: overrides.response,
  };
}

describe("getErrorDetail", () => {
  it("returns the backend's detail message when present", () => {
    const error = axiosError({ response: { data: { detail: "Company not found" } } });
    expect(getErrorDetail(error, "fallback")).toBe("Company not found");
  });

  it("falls back when the axios error has no detail field", () => {
    const error = axiosError({ response: { data: {} } });
    expect(getErrorDetail(error, "fallback")).toBe("fallback");
  });

  it("falls back for a non-axios error (e.g. a thrown string or plain Error)", () => {
    expect(getErrorDetail(new Error("boom"), "fallback")).toBe("fallback");
    expect(getErrorDetail("boom", "fallback")).toBe("fallback");
  });
});

describe("classifyError", () => {
  it("classifies a response-less axios error as a network error", () => {
    expect(classifyError(axiosError({ response: undefined }))).toBe("network");
  });

  it.each([401, 403])("classifies a %i response as unauthorized", (status) => {
    expect(classifyError(axiosError({ response: { status } }))).toBe("unauthorized");
  });

  it("classifies a 404 response as not-found", () => {
    expect(classifyError(axiosError({ response: { status: 404 } }))).toBe("not-found");
  });

  it("classifies any other status as unknown", () => {
    expect(classifyError(axiosError({ response: { status: 500 } }))).toBe("unknown");
  });

  it("classifies a non-axios error as unknown", () => {
    expect(classifyError(new Error("boom"))).toBe("unknown");
  });
});
