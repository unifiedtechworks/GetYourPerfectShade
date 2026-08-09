"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import type { EstimateDetail } from "@/lib/aws/api/estimate-contracts";
import {
  formatCurrencyFromMinorUnits,
  formatMoneyInputFromMinorUnits,
} from "@/lib/estimates/calculations";
import {
  MAX_ALTERNATE_PRICING_LINES,
  MAX_PRICING_LINES,
  MAX_SCOPE_ITEMS,
  MAX_ADDITIONAL_TERMS,
  depositPercentForEditor,
  type EstimateEditorPricingRow,
  type EstimateEditorTextRow,
  validateEstimateEditor,
} from "@/lib/estimates/editor";
import {
  canAddEditorRow,
  initializePricingEditorRows,
  initializeScopeEditorRows,
  initializeTextEditorRows,
  moveTextEditorRow,
  removePricingEditorRow,
  removeScopeEditorRow,
  removeTextEditorRow,
  showAlternatePricing,
} from "@/lib/estimates/editor-state";
import {
  COMPANY_QUALIFICATIONS_TEXT,
  CRAFTSMANSHIP_WARRANTY_TEXT,
  MEASUREMENT_READINESS_TEXT,
  RETAINAGE_TERM_TEXT,
  SALES_TAX_NOTICE_TEXT,
} from "@/lib/estimates/presentation";
import { updateEstimate } from "../actions";
import type { SaveEstimateState } from "../types";
import styles from "../estimates.module.css";

export type EstimateEditorEstimate = Omit<
  EstimateDetail,
  "createdBy" | "updatedBy"
>;

const INITIAL_SAVE_STATE: SaveEstimateState = {
  status: "idle",
  message: "",
  saveSequence: 0,
};

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={styles.primaryButton}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Saving draft..." : "Save draft"}
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className={styles.fieldError}>{message}</span> : null;
}

function timestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

export function EstimateEditor({ estimate }: { estimate: EstimateEditorEstimate }) {
  const boundUpdate = updateEstimate.bind(null, estimate.id);
  const [saveState, action] = useActionState(boundUpdate, INITIAL_SAVE_STATE);
  const [rowVersion, setRowVersion] = useState(estimate.rowVersion);
  const [header, setHeader] = useState({
    documentType: estimate.documentType,
    estimateNumber: estimate.estimateNumber,
    estimateDate: estimate.estimateDate,
    validThrough: estimate.validThrough,
    bidDue: estimate.bidDue,
    projectName: estimate.projectName,
    projectLocation: estimate.projectLocation,
    preparedFor: estimate.preparedFor,
    contactInformation: estimate.contactInformation,
    depositPercent: depositPercentForEditor(estimate.depositPercent),
    includeAlternatePricing: estimate.includeAlternatePricing,
    includePrevailingWageStatement: estimate.includePrevailingWageStatement,
    prevailingWageStatement: estimate.prevailingWageStatement,
    leadTime: estimate.leadTime,
    pricingValidDays: estimate.pricingValidDays,
    projectNotes: estimate.projectNotes,
  });
  const [scopeItems, setScopeItems] = useState<EstimateEditorTextRow[]>(() =>
    initializeScopeEditorRows(
      estimate.scopeItems.map((row, index) => ({
        key: `scope-${row.sortOrder}-${index}`,
        description: row.description,
      })),
    ),
  );
  const [pricingLines, setPricingLines] = useState<EstimateEditorPricingRow[]>(
    () =>
      initializePricingEditorRows(
        estimate.pricingLines.map((row, index) => ({
          key: `base-${row.sortOrder}-${index}`,
          description: row.description,
          amount: formatMoneyInputFromMinorUnits(BigInt(row.amountMinor)),
        })),
        "base",
      ),
  );
  const [alternatePricingLines, setAlternatePricingLines] = useState<
    EstimateEditorPricingRow[]
  >(() =>
    initializePricingEditorRows(
      estimate.alternatePricingLines.map((row, index) => ({
        key: `alternate-${row.sortOrder}-${index}`,
        description: row.description,
        amount: formatMoneyInputFromMinorUnits(BigInt(row.amountMinor)),
      })),
      "alternate",
    ),
  );
  const [terms, setTerms] = useState<EstimateEditorTextRow[]>(() =>
    initializeTextEditorRows(
      estimate.terms.map((row, index) => ({
        key: `term-${row.sortOrder}-${index}`,
        description: row.description,
      })),
      "term",
    ),
  );
  const [addenda, setAddenda] = useState<EstimateEditorTextRow[]>(() =>
    initializeTextEditorRows(
      estimate.addenda.map((row, index) => ({
        key: `addendum-${row.sortOrder}-${index}`,
        description: row.description,
      })),
      "addendum",
    ),
  );
  const [dirty, setDirty] = useState(false);
  const [messageVisible, setMessageVisible] = useState(false);
  const [localMessage, setLocalMessage] = useState("");
  const nextKey = useRef(1);

  const readOnly = estimate.status !== "draft" || saveState.status === "readonly";
  const validation = useMemo(
    () =>
      validateEstimateEditor({
        expectedRowVersion: rowVersion,
        ...header,
        scopeItems,
        pricingLines,
        alternatePricingLines,
        terms,
        addenda,
      }),
    [addenda, alternatePricingLines, header, pricingLines, rowVersion, scopeItems, terms],
  );

  useEffect(() => {
    if (saveState.saveSequence === 0) return;
    setMessageVisible(true);
    if (saveState.status === "success" && saveState.rowVersion) {
      setRowVersion(saveState.rowVersion);
      setDirty(false);
      setLocalMessage("");
    }
  }, [saveState]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function changed(): void {
    if (readOnly) return;
    setDirty(true);
    setMessageVisible(false);
    setLocalMessage("");
  }

  function updateHeader(name: keyof typeof header, value: string | boolean) {
    setHeader((current) => ({ ...current, [name]: value }));
    changed();
  }

  function addScopeRow() {
    if (!canAddEditorRow(scopeItems.length, MAX_SCOPE_ITEMS)) {
      setLocalMessage(`Scope of work supports up to ${MAX_SCOPE_ITEMS} items.`);
      return;
    }
    setScopeItems((rows) => [
      ...rows,
      { key: `scope-new-${nextKey.current++}`, description: "" },
    ]);
    changed();
  }

  function removeScopeRow(index: number) {
    if (
      scopeItems[index].description.trim() &&
      !window.confirm("Remove this scope item from the draft?")
    ) {
      return;
    }
    setScopeItems((rows) => removeScopeEditorRow(rows, index));
    changed();
  }

  function addPricingRow(kind: "base" | "alternate") {
    const rows = kind === "base" ? pricingLines : alternatePricingLines;
    const maximum =
      kind === "base" ? MAX_PRICING_LINES : MAX_ALTERNATE_PRICING_LINES;
    if (!canAddEditorRow(rows.length, maximum)) {
      setLocalMessage(
        `${kind === "base" ? "Pricing" : "Alternate pricing"} supports up to ${maximum} lines.`,
      );
      return;
    }
    const row = {
      key: `${kind}-new-${nextKey.current++}`,
      description: "",
      amount: "",
    };
    if (kind === "base") setPricingLines((current) => [...current, row]);
    else setAlternatePricingLines((current) => [...current, row]);
    changed();
  }

  function removePricingRow(kind: "base" | "alternate", index: number) {
    const row =
      kind === "base" ? pricingLines[index] : alternatePricingLines[index];
    if (
      (row.description.trim() || row.amount.trim()) &&
      !window.confirm(
        `Remove this ${kind === "base" ? "pricing" : "alternate pricing"} line from the draft?`,
      )
    ) {
      return;
    }
    if (kind === "base") {
      setPricingLines((rows) => removePricingEditorRow(rows, index, "base"));
    } else {
      setAlternatePricingLines((rows) =>
        removePricingEditorRow(rows, index, "alternate"),
      );
    }
    changed();
  }

  function addTextRow(kind: "term" | "addendum") {
    const rows = kind === "term" ? terms : addenda;
    if (kind === "term" && !canAddEditorRow(rows.length, MAX_ADDITIONAL_TERMS)) {
      setLocalMessage(
        `Additional terms support up to ${MAX_ADDITIONAL_TERMS} items.`,
      );
      return;
    }
    const row = {
      key: `${kind}-new-${nextKey.current++}`,
      description: "",
    };
    if (kind === "term") setTerms((current) => [...current, row]);
    else setAddenda((current) => [...current, row]);
    changed();
  }

  function removeTextRow(kind: "term" | "addendum", index: number) {
    const rows = kind === "term" ? terms : addenda;
    if (
      rows[index].description.trim() &&
      !window.confirm(
        `Remove this ${kind === "term" ? "term or exclusion" : "addendum"} from the draft?`,
      )
    ) {
      return;
    }
    if (kind === "term") {
      setTerms((current) => removeTextEditorRow(current, index, kind));
    } else {
      setAddenda((current) => removeTextEditorRow(current, index, kind));
    }
    changed();
  }

  function moveTextRow(
    kind: "term" | "addendum",
    index: number,
    direction: -1 | 1,
  ) {
    if (kind === "term") {
      setTerms((current) => moveTextEditorRow(current, index, direction));
    } else {
      setAddenda((current) => moveTextEditorRow(current, index, direction));
    }
    changed();
  }

  const serverFields = messageVisible ? saveState.fields ?? {} : {};

  return (
    <form action={action} className={styles.editorForm} onChange={changed}>
      <header className={styles.editorHeader}>
        <div>
          <div className={styles.eyebrow}>Estimate editor</div>
          <h1>{header.projectName || "Untitled project"}</h1>
          <p className={styles.intro}>
            {estimate.customerName} · Revision {estimate.revisionNumber}
          </p>
        </div>
        <div className={styles.saveCluster}>
          <span
            className={`${styles.statusBadge} ${dirty ? styles.unsaved : styles.saved}`}
            role="status"
          >
            {readOnly
              ? `${estimate.status} · read only`
              : dirty
                ? "Unsaved changes"
                : "All changes saved"}
          </span>
          {!readOnly && <SaveButton disabled={!dirty} />}
          <a
            className={styles.secondaryButton}
            href={`/app/estimates/${encodeURIComponent(estimate.id)}/preview`}
          >
            Preview saved draft
          </a>
        </div>
      </header>

      <nav aria-label="Estimate editor sections" className={styles.sectionNav}>
        <a href="#project-information">Project</a>
        <a href="#scope-of-work">Scope of Work</a>
        <a href="#pricing">Pricing</a>
        <a href="#addenda">Addenda</a>
        <a href="#terms-and-notes">Terms &amp; Notes</a>
        <a href="#proposal-preview">Preview</a>
      </nav>

      {readOnly && (
        <p className={styles.warning} role="status">
          This estimate is {estimate.status}. Issued estimates and their rows
          cannot be edited in place, and only drafts are editable.
        </p>
      )}
      {messageVisible && saveState.message && (
        <div
          className={
            saveState.status === "success" ? styles.success : styles.error
          }
          role={saveState.status === "success" ? "status" : "alert"}
        >
          {saveState.message}
          {saveState.status === "stale" && (
            <button
              className={styles.inlineButton}
              onClick={() => window.location.reload()}
              type="button"
            >
              Reload latest draft
            </button>
          )}
        </div>
      )}
      {localMessage && (
        <p className={styles.error} role="alert">
          {localMessage}
        </p>
      )}

      <input name="expectedRowVersion" type="hidden" value={rowVersion} />
      <input
        name="scopeItemsJson"
        type="hidden"
        value={JSON.stringify(scopeItems)}
      />
      <input
        name="pricingLinesJson"
        type="hidden"
        value={JSON.stringify(pricingLines)}
      />
      <input
        name="alternatePricingLinesJson"
        type="hidden"
        value={JSON.stringify(alternatePricingLines)}
      />
      <input name="termsJson" type="hidden" value={JSON.stringify(terms)} />
      <input name="addendaJson" type="hidden" value={JSON.stringify(addenda)} />

      <fieldset className={styles.editorSection} disabled={readOnly} id="project-information">
        <legend>Project and estimate information</legend>
        <div className={styles.metadataGrid}>
          <div>
            <span>Customer record</span>
            <strong>{estimate.customerName}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong className={styles.capitalize}>{estimate.status}</strong>
          </div>
          <div>
            <span>Estimate ID</span>
            <strong className={styles.identifier}>{estimate.id}</strong>
          </div>
          <div>
            <span>Last saved</span>
            <strong>{timestamp(saveState.savedAt ?? estimate.updatedAt)}</strong>
          </div>
        </div>
        <p className={styles.help}>
          Customer creation remains the approved Phase 1 workflow. This editor
          updates the linked project and preserves the estimate snapshot.
        </p>
        <div className={styles.fieldGrid}>
          <label>
            Document Type
            <select
              name="documentType"
              onChange={(event) => updateHeader("documentType", event.target.value)}
              value={header.documentType}
            >
              <option>Bid Proposal</option>
              <option>Estimate</option>
            </select>
            <FieldError message={serverFields.documentType} />
          </label>
          <label>
            Bid Number
            <input
              name="estimateNumber"
              onChange={(event) => updateHeader("estimateNumber", event.target.value)}
              value={header.estimateNumber}
            />
          </label>
          <label>
            Bid Date
            <input
              name="estimateDate"
              onChange={(event) => updateHeader("estimateDate", event.target.value)}
              value={header.estimateDate}
            />
          </label>
          <label>
            Valid Through
            <input
              name="validThrough"
              onChange={(event) => updateHeader("validThrough", event.target.value)}
              value={header.validThrough}
            />
          </label>
          <label>
            Bid Due
            <input
              name="bidDue"
              onChange={(event) => updateHeader("bidDue", event.target.value)}
              value={header.bidDue}
            />
          </label>
          <label>
            Project Name *
            <input
              aria-invalid={Boolean(serverFields.projectName)}
              name="projectName"
              onChange={(event) => updateHeader("projectName", event.target.value)}
              required
              value={header.projectName}
            />
            <FieldError message={serverFields.projectName} />
          </label>
          <label>
            Project Location
            <input
              name="projectLocation"
              onChange={(event) => updateHeader("projectLocation", event.target.value)}
              value={header.projectLocation}
            />
          </label>
          <label>
            Architect *
            <input
              aria-invalid={Boolean(serverFields.preparedFor)}
              name="preparedFor"
              onChange={(event) => updateHeader("preparedFor", event.target.value)}
              required
              value={header.preparedFor}
            />
            <FieldError message={serverFields.preparedFor} />
          </label>
          <label className={styles.fullWidth}>
            Owner
            <textarea
              name="contactInformation"
              onChange={(event) =>
                updateHeader("contactInformation", event.target.value)
              }
              rows={3}
              value={header.contactInformation}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.editorSection} disabled={readOnly} id="scope-of-work">
        <legend>Scope of Work</legend>
        <p className={styles.help}>
          Blank rows are ignored when saved. Up to {MAX_SCOPE_ITEMS} scope
          items are supported.
        </p>
        <div className={styles.rows}>
          {scopeItems.map((row, index) => (
            <div className={styles.scopeRow} key={row.key}>
              <label>
                <span className={styles.visuallyHidden}>Scope item {index + 1}</span>
                <input
                  onChange={(event) => {
                    setScopeItems((current) =>
                      current.map((item, rowIndex) =>
                        rowIndex === index
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    );
                    changed();
                  }}
                  placeholder={`Scope item ${index + 1}`}
                  value={row.description}
                />
              </label>
              <button
                className={styles.removeButton}
                onClick={() => removeScopeRow(index)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <FieldError message={serverFields.scopeItems} />
        <button className={styles.secondaryButton} onClick={addScopeRow} type="button">
          Add Scope Item
        </button>
      </fieldset>

      <fieldset className={styles.editorSection} disabled={readOnly} id="pricing">
        <legend>Pricing</legend>
        <p className={styles.help}>
          Blank rows are ignored. A nonblank row needs an amount. Credits may
          use negative amounts.
        </p>
        <div className={styles.pricingHeader} aria-hidden="true">
          <span>Description</span>
          <span>Amount</span>
          <span />
        </div>
        <div className={styles.rows}>
          {pricingLines.map((row, index) => (
            <div className={styles.pricingRow} key={row.key}>
              <label>
                <span className={styles.visuallyHidden}>
                  Pricing description {index + 1}
                </span>
                <input
                  onChange={(event) => {
                    setPricingLines((current) =>
                      current.map((item, rowIndex) =>
                        rowIndex === index
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    );
                    changed();
                  }}
                  placeholder={`Pricing description ${index + 1}`}
                  value={row.description}
                />
              </label>
              <label>
                <span className={styles.visuallyHidden}>
                  Pricing amount {index + 1}
                </span>
                <input
                  aria-invalid={Boolean(
                    serverFields[`pricingLines.${index}.amount`],
                  )}
                  inputMode="decimal"
                  onChange={(event) => {
                    setPricingLines((current) =>
                      current.map((item, rowIndex) =>
                        rowIndex === index
                          ? { ...item, amount: event.target.value }
                          : item,
                      ),
                    );
                    changed();
                  }}
                  placeholder="$0.00"
                  value={row.amount}
                />
                <FieldError
                  message={serverFields[`pricingLines.${index}.amount`]}
                />
              </label>
              <button
                className={styles.removeButton}
                onClick={() => removePricingRow("base", index)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <FieldError message={serverFields.pricingLines} />
        <button
          className={styles.secondaryButton}
          onClick={() => addPricingRow("base")}
          type="button"
        >
          Add Pricing Line
        </button>

        <div className={styles.alternateSection}>
          <label className={styles.checkboxLabel}>
            <input
              checked={header.includeAlternatePricing}
              name="includeAlternatePricing"
              onChange={(event) =>
                updateHeader("includeAlternatePricing", event.target.checked)
              }
              type="checkbox"
            />
            Include Alternate Pricing
          </label>
          {showAlternatePricing(header.includeAlternatePricing) && (
            <>
              <p className={styles.help}>
                Alternate amounts are saved separately and never change the
                base estimate total, deposit, or balance.
              </p>
              <div className={styles.pricingHeader} aria-hidden="true">
                <span>Description</span>
                <span>Amount</span>
                <span />
              </div>
              <div className={styles.rows}>
                {alternatePricingLines.map((row, index) => (
                  <div className={styles.pricingRow} key={row.key}>
                    <label>
                      <span className={styles.visuallyHidden}>
                        Alternate description {index + 1}
                      </span>
                      <input
                        onChange={(event) => {
                          setAlternatePricingLines((current) =>
                            current.map((item, rowIndex) =>
                              rowIndex === index
                                ? { ...item, description: event.target.value }
                                : item,
                            ),
                          );
                          changed();
                        }}
                        placeholder={`Alternate description ${index + 1}`}
                        value={row.description}
                      />
                    </label>
                    <label>
                      <span className={styles.visuallyHidden}>
                        Alternate amount {index + 1}
                      </span>
                      <input
                        aria-invalid={Boolean(
                          serverFields[
                            `alternatePricingLines.${index}.amount`
                          ],
                        )}
                        inputMode="decimal"
                        onChange={(event) => {
                          setAlternatePricingLines((current) =>
                            current.map((item, rowIndex) =>
                              rowIndex === index
                                ? { ...item, amount: event.target.value }
                                : item,
                            ),
                          );
                          changed();
                        }}
                        placeholder="$0.00"
                        value={row.amount}
                      />
                      <FieldError
                        message={
                          serverFields[`alternatePricingLines.${index}.amount`]
                        }
                      />
                    </label>
                    <button
                      className={styles.removeButton}
                      onClick={() => removePricingRow("alternate", index)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <FieldError message={serverFields.alternatePricingLines} />
              <button
                className={styles.secondaryButton}
                onClick={() => addPricingRow("alternate")}
                type="button"
              >
                Add Alternate Price
              </button>
            </>
          )}
        </div>

        <div className={styles.financialGrid}>
          <label className={styles.depositField}>
            Deposit %
            <input
              aria-invalid={Boolean(
                serverFields.depositPercent || validation.fields.depositPercent,
              )}
              inputMode="decimal"
              name="depositPercent"
              onChange={(event) => updateHeader("depositPercent", event.target.value)}
              value={header.depositPercent}
            />
            <FieldError
              message={
                serverFields.depositPercent || validation.fields.depositPercent
              }
            />
          </label>
          <dl className={styles.totals} aria-live="polite">
            <div>
              <dt>Base Subtotal</dt>
              <dd>{formatCurrencyFromMinorUnits(validation.totals.subtotalMinor)}</dd>
            </div>
            <div>
              <dt>Sales Tax (fixed 0%)</dt>
              <dd>{formatCurrencyFromMinorUnits(validation.totals.salesTaxMinor)}</dd>
            </div>
            <div className={styles.totalLine}>
              <dt>Main Total</dt>
              <dd>{formatCurrencyFromMinorUnits(validation.totals.totalMinor)}</dd>
            </div>
            <div>
              <dt>Required Deposit</dt>
              <dd>
                {formatCurrencyFromMinorUnits(
                  validation.totals.requiredDepositMinor,
                )}
              </dd>
            </div>
            <div>
              <dt>Remaining Balance</dt>
              <dd>
                {formatCurrencyFromMinorUnits(
                  validation.totals.remainingBalanceMinor,
                )}
              </dd>
            </div>
            {showAlternatePricing(header.includeAlternatePricing) && (
              <div className={styles.alternateTotal}>
                <dt>Alternate Total (separate)</dt>
                <dd>
                  {formatCurrencyFromMinorUnits(
                    validation.totals.alternateTotalMinor,
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div className={styles.policyNotes}>
          <p>
            Applicable sales tax will be added unless a valid tax exemption
            certificate is provided. Per desktop behavior, tax is not included
            in the estimate total.
          </p>
          <p>
            Maximum retainage shall be limited to 5% of the contract amount
            unless otherwise agreed in writing. Retainage does not alter these
            calculations.
          </p>
        </div>
      </fieldset>

      <fieldset className={styles.editorSection} disabled={readOnly} id="addenda">
        <legend>Addenda Acknowledgement</legend>
        <p className={styles.help}>
          Addenda are optional. Blank rows are ignored, and the preview omits this
          section when no acknowledgements are saved.
        </p>
        <div className={styles.rows}>
          {addenda.map((row, index) => (
            <div className={styles.scopeRow} key={row.key}>
              <label>
                <span className={styles.visuallyHidden}>Addendum {index + 1}</span>
                <textarea
                  onChange={(event) => {
                    setAddenda((current) =>
                      current.map((item, rowIndex) =>
                        rowIndex === index
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    );
                    changed();
                  }}
                  placeholder={`Addendum ${index + 1}`}
                  rows={2}
                  value={row.description}
                />
              </label>
              <div className={styles.rowActions}>
                <button
                  className={styles.secondaryButton}
                  disabled={index === 0}
                  onClick={() => moveTextRow("addendum", index, -1)}
                  type="button"
                >Up</button>
                <button
                  className={styles.secondaryButton}
                  disabled={index === addenda.length - 1}
                  onClick={() => moveTextRow("addendum", index, 1)}
                  type="button"
                >Down</button>
                <button
                  className={styles.removeButton}
                  onClick={() => removeTextRow("addendum", index)}
                  type="button"
                >Remove</button>
              </div>
            </div>
          ))}
        </div>
        <button
          className={styles.secondaryButton}
          onClick={() => addTextRow("addendum")}
          type="button"
        >
          Add Addendum
        </button>
      </fieldset>

      <fieldset
        className={styles.editorSection}
        disabled={readOnly}
        id="terms-and-notes"
      >
        <legend>Terms &amp; Notes</legend>
        <div className={styles.fieldGrid}>
          <label>
            Pricing Valid For Days
            <input
              name="pricingValidDays"
              onChange={(event) =>
                updateHeader("pricingValidDays", event.target.value)
              }
              value={header.pricingValidDays}
            />
          </label>
          <label>
            Estimated Lead Time
            <input
              name="leadTime"
              onChange={(event) => updateHeader("leadTime", event.target.value)}
              value={header.leadTime}
            />
          </label>
        </div>
        <div className={styles.policyNotes}>
          <p>{SALES_TAX_NOTICE_TEXT}</p>
          <p>{RETAINAGE_TERM_TEXT}</p>
          <p>Retainage is proposal wording only and does not change financial totals.</p>
        </div>

        <div className={styles.subsection}>
          <h2>Prevailing Wage</h2>
          <label className={styles.checkboxLabel}>
            <input
              checked={header.includePrevailingWageStatement}
              name="includePrevailingWageStatement"
              onChange={(event) =>
                updateHeader(
                  "includePrevailingWageStatement",
                  event.target.checked,
                )
              }
              type="checkbox"
            />
            Include Prevailing Wage Statement
          </label>
          <label>
            <span className={styles.visuallyHidden}>Prevailing Wage Statement</span>
            <textarea
              name="prevailingWageStatement"
              onChange={(event) =>
                updateHeader("prevailingWageStatement", event.target.value)
              }
              rows={3}
              value={header.prevailingWageStatement}
            />
          </label>
          <p className={styles.help}>
            The wording remains editable and is preserved when the checkbox is
            turned off. It appears in the preview only when enabled.
          </p>
        </div>

        <div className={styles.subsection}>
          <h2>Additional Terms / Exclusions</h2>
          <p className={styles.help}>
            Blank rows are ignored. Up to {MAX_ADDITIONAL_TERMS} ordered items
            are supported.
          </p>
          <div className={styles.rows}>
            {terms.map((row, index) => (
              <div className={styles.scopeRow} key={row.key}>
                <label>
                  <span className={styles.visuallyHidden}>
                    Term or exclusion {index + 1}
                  </span>
                  <textarea
                    onChange={(event) => {
                      setTerms((current) =>
                        current.map((item, rowIndex) =>
                          rowIndex === index
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      );
                      changed();
                    }}
                    placeholder={`Term or exclusion ${index + 1}`}
                    rows={2}
                    value={row.description}
                  />
                </label>
                <div className={styles.rowActions}>
                  <button
                    className={styles.secondaryButton}
                    disabled={index === 0}
                    onClick={() => moveTextRow("term", index, -1)}
                    type="button"
                  >Up</button>
                  <button
                    className={styles.secondaryButton}
                    disabled={index === terms.length - 1}
                    onClick={() => moveTextRow("term", index, 1)}
                    type="button"
                  >Down</button>
                  <button
                    className={styles.removeButton}
                    onClick={() => removeTextRow("term", index)}
                    type="button"
                  >Remove</button>
                </div>
              </div>
            ))}
          </div>
          <FieldError message={serverFields.terms} />
          <button
            className={styles.secondaryButton}
            onClick={() => addTextRow("term")}
            type="button"
          >
            Add Term / Exclusion
          </button>
        </div>

        <label>
          Project Notes
          <textarea
            name="projectNotes"
            onChange={(event) => updateHeader("projectNotes", event.target.value)}
            rows={5}
            value={header.projectNotes}
          />
        </label>

        <div className={styles.constantSections}>
          <article>
            <h2>Measurement Readiness</h2>
            <p>{MEASUREMENT_READINESS_TEXT}</p>
          </article>
          <article>
            <h2>One-Year Craftsmanship Warranty</h2>
            <p>{CRAFTSMANSHIP_WARRANTY_TEXT}</p>
          </article>
          <article>
            <h2>Company Qualifications</h2>
            <p>{COMPANY_QUALIFICATIONS_TEXT}</p>
          </article>
        </div>
      </fieldset>

      <section className={styles.editorSection} id="proposal-preview">
        <h2>Proposal Preview</h2>
        <p className={styles.help}>
          Preview uses the last saved draft and clearly labels it as a draft.
          Save first if this editor shows unsaved changes.
        </p>
        <a
          className={styles.primaryButton}
          href={`/app/estimates/${encodeURIComponent(estimate.id)}/preview`}
        >
          Open saved-draft preview
        </a>
      </section>

      <footer className={styles.editorFooter}>
        <div aria-live="polite">
          {dirty ? "Unsaved changes" : "Draft is up to date"}
        </div>
        {!readOnly && <SaveButton disabled={!dirty} />}
      </footer>
    </form>
  );
}
