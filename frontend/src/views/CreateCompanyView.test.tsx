import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/companies", () => ({
  createCompany: vi.fn(),
  uploadCompanyLogo: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ useToast: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { createCompany, uploadCompanyLogo } from "@/api/companies";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import type { UserRole } from "@/types/auth";
import type { Company } from "@/types/company";
import { CreateCompanyView } from "@/views/CreateCompanyView";

const showToast = vi.fn();

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-new",
    organization_id: "org-1",
    name: "Senus PLC",
    industry: null,
    fiscal_year_end: null,
    currency: "USD",
    reporting_frequency: null,
    fiscal_year_start_month: 1,
    investor_relations_url: null,
    auto_fetch_enabled: false,
    last_fetch_checked_at: null,
    last_fetch_result: null,
    description: null,
    founded_date: null,
    website_url: null,
    headquarters_location: null,
    employee_count_range: null,
    logo_url: null,
    ...overrides,
  };
}

function mockAuth(role: UserRole) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "user-1", role },
  } as unknown as ReturnType<typeof useAuth>);
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/companies/new"]}>
      <Routes>
        <Route path="/companies/new" element={<CreateCompanyView />} />
        <Route path="/companies" element={<div>Companies List Page</div>} />
        <Route path="/companies/:companyId" element={<div>Company Detail Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CreateCompanyView", () => {
  beforeEach(() => {
    vi.mocked(createCompany).mockReset();
    vi.mocked(uploadCompanyLogo).mockReset();
    vi.mocked(useToast).mockReturnValue({ showToast } as unknown as ReturnType<typeof useToast>);
    showToast.mockReset();
    // jsdom doesn't implement these - CompanyLogoStager only uses them to build
    // a local preview of a staged file, nothing worth asserting on here.
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();
  });

  it("redirects non-managers away from the page", async () => {
    mockAuth("analyst");
    renderView();

    expect(await screen.findByText("Companies List Page")).toBeInTheDocument();
    expect(createCompany).not.toHaveBeenCalled();
  });

  it("disables Save until a company name is entered", () => {
    mockAuth("owner");
    renderView();

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Company Name"), { target: { value: "Senus PLC" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("creates the company and navigates to its detail page", async () => {
    mockAuth("owner");
    vi.mocked(createCompany).mockResolvedValue(company());
    renderView();

    fireEvent.change(screen.getByLabelText("Company Name"), { target: { value: "Senus PLC" } });
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Software" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createCompany).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Senus PLC", industry: "Software" }),
      ),
    );
    expect(uploadCompanyLogo).not.toHaveBeenCalled();
    expect(await screen.findByText("Company Detail Page")).toBeInTheDocument();
  });

  it("uploads a staged logo after the company is created", async () => {
    mockAuth("owner");
    vi.mocked(createCompany).mockResolvedValue(company());
    vi.mocked(uploadCompanyLogo).mockResolvedValue({ logo_url: "/logo.png" });
    const { container } = renderView();

    fireEvent.change(screen.getByLabelText("Company Name"), { target: { value: "Senus PLC" } });
    const logoFile = new File(["img-bytes"], "logo.png", { type: "image/png" });
    const fileInput = container.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [logoFile] } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(uploadCompanyLogo).toHaveBeenCalledWith("company-new", logoFile));
    expect(await screen.findByText("Company Detail Page")).toBeInTheDocument();
  });

  it("still navigates and shows a toast when the logo upload fails after company creation", async () => {
    mockAuth("owner");
    vi.mocked(createCompany).mockResolvedValue(company());
    vi.mocked(uploadCompanyLogo).mockRejectedValue(new Error("upload failed"));
    const { container } = renderView();

    fireEvent.change(screen.getByLabelText("Company Name"), { target: { value: "Senus PLC" } });
    const logoFile = new File(["img-bytes"], "logo.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [logoFile] } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "Company created, but the logo didn't upload — you can retry it from the company page.",
        "info",
      ),
    );
    expect(await screen.findByText("Company Detail Page")).toBeInTheDocument();
  });

  it("shows the backend error and stays on the page when creation itself fails", async () => {
    mockAuth("owner");
    vi.mocked(createCompany).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "A company with this name already exists" } },
    });
    renderView();

    fireEvent.change(screen.getByLabelText("Company Name"), { target: { value: "Senus PLC" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("A company with this name already exists")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("trims a pasted trailing space from the website field before submitting", async () => {
    mockAuth("owner");
    vi.mocked(createCompany).mockResolvedValue(company());
    renderView();

    fireEvent.change(screen.getByLabelText("Company Name"), { target: { value: "Senus PLC" } });
    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "https://www.senus.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createCompany).toHaveBeenCalledWith(
        expect.objectContaining({ website_url: "https://www.senus.com" }),
      ),
    );
    expect(await screen.findByText("Company Detail Page")).toBeInTheDocument();
  });

  it("shows a 422 field error inline next to the Website field, not as a generic failure", async () => {
    mockAuth("owner");
    vi.mocked(createCompany).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          detail: [
            {
              loc: ["body", "website_url"],
              msg: "website_url must be a valid http(s) URL, e.g. https://example.com",
              type: "value_error",
            },
          ],
        },
      },
    });
    renderView();

    fireEvent.change(screen.getByLabelText("Company Name"), { target: { value: "Senus PLC" } });
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "htp:/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("website_url must be a valid http(s) URL, e.g. https://example.com"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Failed to create company")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("cancel navigates away without creating a company", async () => {
    mockAuth("owner");
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Companies List Page")).toBeInTheDocument();
    expect(createCompany).not.toHaveBeenCalled();
  });
});
