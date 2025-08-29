# Release v1.0.0-mvp-stable

This release contains the changes from the MVP stabilization plan.

## Changes

### T1: Defuse Renderer Fallback
- Removed stale renderer fallback for invoice generation. The renderer now trusts the main-process assigned invoice number.

### T2: Centralize Cart Overlay Button Handlers
- Centralized the wiring of **Quotation**, **Preview Invoice**, and **Checkout** buttons in the `renderCartOverlay` function to prevent duplicate event listeners.

### T3: Barcode Delegation to main.js
- The renderer now delegates barcode generation to `main.js` via IPC. This ensures consistency with bulk regeneration and printing.

### T4: Live Barcode in "Add Product" Modal
- The "Add Product" modal now shows a live preview of the barcode as the user types. The auto-generation stops if the user manually edits the barcode field.

### T5: Cleanup
- Removed obsolete `quotation-bridge.js` references and file to prevent race conditions.

## No Changes To Core Modules
- **Invoice Numbering:** No changes to the `INVYYYYMMDD####` format or the underlying generation logic.
- **Printing:** No changes to invoice, quotation, or label printing payloads or templates.
- **Invoice History:** No changes to the Invoice History tab, queries, or functionality.
- **CSV Import/Export:** No changes to CSV import/export logic.
- **Barcode Regeneration:** The "Regenerate All" functionality is unchanged.
