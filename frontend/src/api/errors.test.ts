import { describe, expect, it } from "vitest";

import { classifyError, getErrorDetail, getFieldErrors } from "@/api/errors";

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

describe("getFieldErrors", () => {
  it("maps a FastAPI 422 body's loc/msg pairs to field-keyed messages", () => {
    const error = axiosError({
      response: {
        status: 422,
        data: {
          detail: [
            { loc: ["body", "website_url"], msg: "website_url must be a valid http(s) URL", type: "value_error" },
          ],
        },
      },
    });
    expect(getFieldErrors(error)).toEqual({ website_url: "website_url must be a valid http(s) URL" });
  });

  it("handles multiple field errors in one response", () => {
    const error = axiosError({
      response: {
        status: 422,
        data: {
          detail: [
            { loc: ["body", "name"], msg: "field required", type: "missing" },
            { loc: ["body", "website_url"], msg: "invalid URL", type: "value_error" },
          ],
        },
      },
    });
    expect(getFieldErrors(error)).toEqual({ name: "field required", website_url: "invalid URL" });
  });

  it("returns null for a non-422 status even if detail happens to be an array", () => {
    const error = axiosError({ response: { status: 400, data: { detail: [{ loc: ["body", "x"], msg: "m" }] } } });
    expect(getFieldErrors(error)).toBeNull();
  });

  it("returns null when detail is a plain string, not an array", () => {
    const error = axiosError({ response: { status: 422, data: { detail: "Invalid email or password" } } });
    expect(getFieldErrors(error)).toBeNull();
  });

  it("returns null for a non-axios error", () => {
    expect(getFieldErrors(new Error("boom"))).toBeNull();
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
