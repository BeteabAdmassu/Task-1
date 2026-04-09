import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../client/src/contexts/AuthContext';
import { ReceivingForm } from '../../client/src/pages/ReceivingForm';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../client/src/api/purchase-orders', () => ({
  fetchPos: vi.fn(),
}));

vi.mock('../../client/src/api/receiving', () => ({
  fetchPutawayLocations: vi.fn(),
  createReceipt: vi.fn(),
  completeReceipt: vi.fn(),
}));

import { fetchPos } from '../../client/src/api/purchase-orders';
import { fetchPutawayLocations, createReceipt, completeReceipt } from '../../client/src/api/receiving';

const mockFetchPos = vi.mocked(fetchPos);
const mockFetchPutawayLocations = vi.mocked(fetchPutawayLocations);
const mockCreateReceipt = vi.mocked(createReceipt);
const mockCompleteReceipt = vi.mocked(completeReceipt);

// ── Sample data ───────────────────────────────────────────────────────────────

const samplePo = {
  id: 'po-1',
  poNumber: 'PO-2024-00001',
  status: 'ISSUED',
  supplier: { id: 's-1', name: 'Test Supplier' },
  requestId: null,
  request: null,
  supplierId: 's-1',
  lineItems: [
    {
      id: 'li-1',
      description: 'Widget A',
      quantity: 10,
      unitPrice: 5,
      totalPrice: 50,
      quantityReceived: 0,
      catalogItemId: 'CAT-001',
    },
    {
      id: 'li-2',
      description: 'Widget B',
      quantity: 5,
      unitPrice: 10,
      totalPrice: 50,
      quantityReceived: 0,
      catalogItemId: null,
    },
  ],
  totalAmount: 100,
  issuedAt: null,
  expectedDeliveryDate: null,
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ── Render helpers ────────────────────────────────────────────────────────────

function renderForm() {
  // Stub the auth refresh call
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

  return render(
    <MemoryRouter>
      <AuthProvider>
        <ReceivingForm />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReceivingForm — entry mode', () => {
  beforeEach(() => {
    // Both ISSUED and PARTIALLY_RECEIVED calls return the same PO
    // to exercise the deduplication logic.
    mockFetchPos.mockResolvedValue({
      data: [samplePo],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    mockFetchPutawayLocations.mockResolvedValue([]);
    mockCreateReceipt.mockResolvedValue({ id: 'rec-1' } as ReturnType<typeof createReceipt> extends Promise<infer T> ? T : never);
    mockCompleteReceipt.mockResolvedValue({} as ReturnType<typeof completeReceipt> extends Promise<infer T> ? T : never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the mode selector with MANUAL selected by default', async () => {
    renderForm();

    await waitFor(() => {
      const manualRadio = screen.getByRole('radio', { name: /manual entry/i });
      expect(manualRadio).toBeInTheDocument();
      expect(manualRadio).toBeChecked();
    });

    expect(screen.getByRole('radio', { name: /barcode scan/i })).toBeInTheDocument();
  });

  it('does not show scan input in MANUAL mode', async () => {
    renderForm();

    await waitFor(() => screen.getByRole('radio', { name: /manual entry/i }));

    expect(screen.queryByLabelText(/scan barcode/i)).not.toBeInTheDocument();
  });

  it('shows scan input after switching to BARCODE mode and selecting a PO', async () => {
    renderForm();

    await waitFor(() => screen.getByRole('radio', { name: /barcode scan/i }));

    // Switch to barcode mode
    await act(async () => {
      await userEvent.click(screen.getByRole('radio', { name: /barcode scan/i }));
    });

    // Select a PO
    await act(async () => {
      await userEvent.selectOptions(
        screen.getByRole('combobox'),
        'po-1',
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/scan barcode/i)).toBeInTheDocument();
    });
  });

  it('displays scan codes for line items in BARCODE mode', async () => {
    renderForm();

    await waitFor(() => screen.getByRole('radio', { name: /barcode scan/i }));

    await act(async () => {
      await userEvent.click(screen.getByRole('radio', { name: /barcode scan/i }));
    });

    await act(async () => {
      await userEvent.selectOptions(screen.getByRole('combobox'), 'po-1');
    });

    await waitFor(() => {
      // CAT-001 is the catalogItemId for line 1
      expect(screen.getByText('CAT-001')).toBeInTheDocument();
      // Line 2 has no catalogItemId, so uses first 8 chars of id
      expect(screen.getByText('LI-2'.slice(0, 8).toUpperCase() || 'LI-2')).not.toBeNull();
    });
  });

  it('increments received quantity when a valid barcode is scanned', async () => {
    renderForm();

    await waitFor(() => screen.getByRole('radio', { name: /barcode scan/i }));

    await act(async () => {
      await userEvent.click(screen.getByRole('radio', { name: /barcode scan/i }));
    });

    await act(async () => {
      await userEvent.selectOptions(screen.getByRole('combobox'), 'po-1');
    });

    await waitFor(() => screen.getByLabelText(/scan barcode/i));

    // Scan CAT-001 (catalogItemId for Widget A)
    await act(async () => {
      await userEvent.type(screen.getByLabelText(/scan barcode/i), 'CAT-001');
      await userEvent.keyboard('{Enter}');
    });

    await waitFor(() => {
      expect(screen.getByTestId('scan-feedback')).toHaveTextContent(/Widget A/);
    });

    // The received qty input for Widget A should now show 11 (10 initial + 1 scan)
    const qtyInputs = screen.getAllByRole('spinbutton');
    expect(qtyInputs[0]).toHaveValue(11);
  });

  it('shows "No match" feedback for unknown barcode', async () => {
    renderForm();

    await waitFor(() => screen.getByRole('radio', { name: /barcode scan/i }));

    await act(async () => {
      await userEvent.click(screen.getByRole('radio', { name: /barcode scan/i }));
    });

    await act(async () => {
      await userEvent.selectOptions(screen.getByRole('combobox'), 'po-1');
    });

    await waitFor(() => screen.getByLabelText(/scan barcode/i));

    await act(async () => {
      await userEvent.type(screen.getByLabelText(/scan barcode/i), 'UNKNOWN-999');
      await userEvent.keyboard('{Enter}');
    });

    await waitFor(() => {
      expect(screen.getByTestId('scan-feedback')).toHaveTextContent(/No match/);
    });
  });

  it('passes entryMode=BARCODE to createReceipt when in barcode mode', async () => {
    renderForm();

    await waitFor(() => screen.getByRole('radio', { name: /barcode scan/i }));

    // Switch to barcode mode
    await act(async () => {
      await userEvent.click(screen.getByRole('radio', { name: /barcode scan/i }));
    });

    // Select PO
    await act(async () => {
      await userEvent.selectOptions(screen.getByRole('combobox'), 'po-1');
    });

    await waitFor(() => screen.getByRole('button', { name: /complete receiving/i }));

    // Submit
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /complete receiving/i }));

    await waitFor(() => {
      expect(mockCreateReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ entryMode: 'BARCODE' }),
      );
    });
  });

  it('passes entryMode=MANUAL to createReceipt in manual mode', async () => {
    renderForm();

    await waitFor(() => screen.getByRole('combobox'));

    // Select PO (stays in MANUAL mode)
    await act(async () => {
      await userEvent.selectOptions(screen.getByRole('combobox'), 'po-1');
    });

    await waitFor(() => screen.getByRole('button', { name: /complete receiving/i }));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /complete receiving/i }));

    await waitFor(() => {
      expect(mockCreateReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ entryMode: 'MANUAL' }),
      );
    });
  });

  it('deduplicates POs when same id appears in ISSUED and PARTIALLY_RECEIVED results', async () => {
    // Both fetches return the same PO — dedup should produce exactly one <option>
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderForm();

    await waitFor(() => screen.getByRole('combobox'));

    // Count <option> elements (first is the placeholder "— Select a PO —")
    const options = screen.getByRole('combobox').querySelectorAll('option');
    const poOptions = Array.from(options).filter((o) => o.value && o.value !== '');
    expect(poOptions).toHaveLength(1);
    expect(poOptions[0].value).toBe('po-1');

    // No duplicate key warning should have been emitted
    const dupKeyWarnings = consoleSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('same key'),
    );
    expect(dupKeyWarnings).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  it('shows variance reason selector for lines with variance', async () => {
    renderForm();

    await waitFor(() => screen.getByRole('combobox'));

    await act(async () => {
      await userEvent.selectOptions(screen.getByRole('combobox'), 'po-1');
    });

    await waitFor(() => screen.getAllByRole('spinbutton'));

    // Change received qty to 8 (variance = -2)
    const qtyInputs = screen.getAllByRole('spinbutton');
    await act(async () => {
      await userEvent.clear(qtyInputs[0]);
      await userEvent.type(qtyInputs[0], '8');
    });

    // Variance reason select should be required
    const reasonSelects = screen.getAllByRole('combobox');
    // The first select is the PO select, the next ones are variance reason
    expect(reasonSelects.length).toBeGreaterThan(1);
  });
});
