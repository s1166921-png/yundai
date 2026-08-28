import { useEffect, useMemo, useRef, useState } from "react";
import {
  INTAKE_VERSION,
  INTAKE_STEPS,
  INTAKE_INFORMATION_USE_NOTICE,
  INTAKE_SUBMISSION_COPY,
  getVisibleIntakeFields,
  validateIntakeStep,
} from "../lib/matching/intakeSchema.js";
import { invalidateIntakeResult } from "../lib/matching/intakeLifecycle.js";
import { postJson } from "../lib/http/jsonRequest.js";

const initialProfile = {
  intakeVersion: INTAKE_VERSION,
  consentToDataUse: false,
};

const isEmpty = (value) => value == null || value === "" || (Array.isArray(value) && value.length === 0);

const AMAZON_SC_STEP_GROUPS = Object.freeze([
  Object.freeze({
    id: "financing-needs",
    title: "融资需求",
    keys: Object.freeze(["preferredCurrency", "requestedAmount", "fundUse"]),
  }),
  Object.freeze({
    id: "operating-scale",
    title: "经营规模",
    keys: Object.freeze([
      "companyAgeMonths", "legalRepresentativeAge", "platformHistoryMonths", "platformSites",
      "storeCount", "qualifiedStoreCount", "participatingStoreOperatingDays",
    ]),
  }),
  Object.freeze({
    id: "amazon-data",
    title: "Amazon 经营数据",
    keys: Object.freeze([
      "singleStoreGmvUsd", "allStoreSalesRmb", "platformRepaymentsLast12MonthsRmb", "refundRatePercent",
      "amazonAhrScore", "amazonAccountStatus", "fbaInventoryTurnoverCount",
    ]),
  }),
  Object.freeze({
    id: "account-risk",
    title: "账户与风险控制",
    keys: Object.freeze([
      "hasCompatibleCollectionAccount", "borrowerMatchesCollectionEntity", "acceptsAccountControl",
    ]),
  }),
]);

export function groupIntakeStepFields(stepFields, profile) {
  const isAmazonScOperatingStep = profile.primaryBusinessModel === "amazon_sc"
    && stepFields.some((field) => field.key === "includeWebankAssessment");
  if (!isAmazonScOperatingStep) {
    return [{ id: "all-fields", title: null, fields: stepFields }];
  }

  const accordionFields = stepFields.filter((field) => field.key !== "includeWebankAssessment");
  const fieldsByKey = new Map(accordionFields.map((field) => [field.key, field]));
  const groups = AMAZON_SC_STEP_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    fields: group.keys.map((key) => fieldsByKey.get(key)).filter(Boolean),
  }));
  const groupedKeys = new Set(AMAZON_SC_STEP_GROUPS.flatMap((group) => group.keys));
  const remainingFields = accordionFields.filter((field) => !groupedKeys.has(field.key));
  if (remainingFields.length > 0) groups[groups.length - 1].fields.push(...remainingFields);
  return groups.filter((group) => group.fields.length > 0);
}

export function findIntakeGroupForField(groups, fieldKey) {
  return groups.find((group) => group.fields.some((field) => field.key === fieldKey))?.id ?? null;
}

export function nextIntakeGroupIndex(currentIndex, groupCount, key) {
  if (key === "Home") return 0;
  if (key === "End") return groupCount - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (currentIndex + 1) % groupCount;
  if (key === "ArrowLeft" || key === "ArrowUp") return (currentIndex - 1 + groupCount) % groupCount;
  return null;
}

const groupCompletion = (group, profile, errors) => {
  if (group.fields.some((field) => errors[field.key])) return "需检查";
  const completed = group.fields.filter((field) => !isEmpty(profile[field.key])).length;
  if (completed === 0) return "未填写";
  if (completed === group.fields.length) return "已完成";
  return `已填写 ${completed}/${group.fields.length}`;
};

export function focusWizardStepHeading(element, windowObject = globalThis.window) {
  if (element == null) return false;
  let handled = false;

  if (typeof element.focus === "function") {
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
    handled = true;
  }

  if (typeof element.scrollIntoView === "function") {
    const reducedMotion = typeof windowObject?.matchMedia === "function"
      && windowObject.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    } catch {
      element.scrollIntoView(true);
    }
    handled = true;
  }

  return handled;
}

export function clearInactiveIntakeValues(profile, primaryBusinessModel) {
  const nextProfile = { ...profile, primaryBusinessModel };
  const visibleKeys = new Set(getVisibleIntakeFields(nextProfile).map(({ key }) => key));

  return Object.fromEntries(Object.entries(nextProfile).filter(([key]) => (
    key === "intakeVersion" || visibleKeys.has(key)
  )));
}

export function buildProgressiveSubmission(profile) {
  return getVisibleIntakeFields(profile).reduce((payload, field) => {
    const value = profile[field.key];
    if (!isEmpty(value)) payload[field.key] = value;
    return payload;
  }, { intakeVersion: INTAKE_VERSION, estimationMode: "progressive" });
}

const errorMapFrom = (errors) => errors.reduce((result, error) => {
  result[error.key] = error.message;
  return result;
}, {});

const describedByFor = (field, error) => {
  const ids = [];
  if (field.help) ids.push(`intake-${field.key}-help`);
  if (error) ids.push(`intake-${field.key}-error`);
  return ids.length > 0 ? ids.join(" ") : undefined;
};

function FieldSupport({ field, error }) {
  return (
    <>
      {field.help && <small id={`intake-${field.key}-help`} className="field-help">{field.help}</small>}
      {error && <small id={`intake-${field.key}-error`} className="field-error" role="alert">{error}</small>}
    </>
  );
}

export function RequiredFieldMark({ field }) {
  if (!Array.isArray(field?.requiredFor) || field.requiredFor.length === 0) return null;
  return <span className="required-field-mark" aria-hidden="true">*</span>;
}

function FieldLabel({ field }) {
  return <>{field.label}<RequiredFieldMark field={field} /></>;
}

function ChoiceField({ field, value, error, onChange, inputRef }) {
  const selectedValues = Array.isArray(value) ? value : [];
  const describedBy = describedByFor(field, error);

  return (
    <fieldset
      className={`intake-field choice-field ${error ? "has-error" : ""}`}
      aria-describedby={describedBy}
      aria-invalid={error ? "true" : undefined}
      aria-required={field.requiredFor.length > 0 ? "true" : undefined}
    >
      <legend><FieldLabel field={field} /></legend>
      <div className="checkbox-options">
        {field.options.map((option, index) => {
          const checked = selectedValues.includes(option.value);
          return (
            <label key={option.value} className={checked ? "intake-choice selected" : "intake-choice"}>
              <input
                ref={index === 0 ? inputRef : undefined}
                type="checkbox"
                name={field.key}
                value={option.value}
                checked={checked}
                onChange={() => onChange(field.key, option.value, "checkboxes")}
                aria-describedby={describedBy}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      <FieldSupport field={field} error={error} />
    </fieldset>
  );
}

function BooleanField({ field, value, error, onChange, inputRef }) {
  const describedBy = describedByFor(field, error);

  return (
    <fieldset
      className={`intake-field boolean-field ${error ? "has-error" : ""}`}
      aria-describedby={describedBy}
      aria-invalid={error ? "true" : undefined}
      aria-required={field.requiredFor.length > 0 ? "true" : undefined}
    >
      <legend><FieldLabel field={field} /></legend>
      <div className="segmented-control">
        {field.options.map((option, index) => (
          <label key={String(option.value)} className={value === option.value ? "intake-choice selected" : "intake-choice"}>
            <input
              ref={index === 0 ? inputRef : undefined}
              type="radio"
              name={field.key}
              value={String(option.value)}
              checked={value === option.value}
              onChange={() => onChange(field.key, option.value, "boolean")}
              aria-describedby={describedBy}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <FieldSupport field={field} error={error} />
    </fieldset>
  );
}

function WebankToggle({ field, value, error, onChange, inputRef }) {
  const inputId = `intake-${field.key}`;
  const describedBy = describedByFor(field, error);

  return (
    <section className={`intake-field webank-toggle ${error ? "has-error" : ""}`} aria-labelledby={`${inputId}-label`}>
      <div>
        <span id={`${inputId}-label`}><FieldLabel field={field} /></span>
        <small>补充跨境店铺数据后，同时评估微众银行数据贷方向。</small>
      </div>
      <label className="toggle-control" htmlFor={inputId}>
        <input
          id={inputId}
          ref={inputRef}
          type="checkbox"
          name={field.key}
          checked={value === true}
          onChange={(event) => onChange(field.key, event.target.checked, "toggle")}
          aria-describedby={describedBy}
          role="switch"
        />
        <span aria-hidden="true" />
        <b>{value === true ? "已开启" : "未开启"}</b>
      </label>
      <FieldSupport field={field} error={error} />
    </section>
  );
}

function StandardField({ field, value, error, onChange, inputRef }) {
  const inputId = `intake-${field.key}`;
  const describedBy = describedByFor(field, error);
  const required = field.requiredFor.length > 0;
  const sharedProps = {
    id: inputId,
    name: field.key,
    value: value ?? "",
    onChange: (event) => onChange(field.key, event.target.value, field.type),
    "aria-describedby": describedBy,
    "aria-invalid": error ? "true" : undefined,
    required,
    ref: inputRef,
  };

  return (
    <div className={`intake-field ${error ? "has-error" : ""}`}>
      <label htmlFor={inputId}>
        <span><FieldLabel field={field} /></span>
        {field.unit && <small className="field-unit">单位：{field.unit}</small>}
      </label>
      {field.type === "select" ? (
        <select {...sharedProps}>
          <option value="" disabled>请选择</option>
          {field.options.map((option) => (
            <option key={String(option.value)} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <div className={field.type === "number" ? "intake-input-shell has-unit" : "intake-input-shell"}>
          <input
            {...sharedProps}
            type={field.type === "number" ? "number" : field.key === "phone" ? "tel" : "text"}
            inputMode={field.inputMode ?? (field.type === "number" ? "decimal" : undefined)}
            min={field.type === "number" ? field.min ?? 0 : undefined}
            max={field.type === "number" ? field.max : undefined}
            step={field.type === "number" ? "any" : undefined}
            autoComplete={field.key === "companyName"
              ? "organization"
              : field.key === "contactName"
                ? "name"
                : field.key === "phone"
                  ? "tel"
                  : undefined}
          />
          {field.type === "number" && <span aria-hidden="true">{field.unit}</span>}
        </div>
      )}
      <FieldSupport field={field} error={error} />
    </div>
  );
}

function ConsentField({ field, value, error, onChange, inputRef }) {
  const inputId = `intake-${field.key}`;
  const noticeId = `${inputId}-notice`;
  const describedBy = [noticeId, describedByFor(field, error)].filter(Boolean).join(" ");

  return (
    <section className={`intake-field consent-field ${error ? "has-error" : ""}`} aria-labelledby={`${noticeId}-title`}>
      <div className="information-use-notice" id={noticeId}>
        <h4 id={`${noticeId}-title`}>信息使用说明</h4>
        <p>{INTAKE_INFORMATION_USE_NOTICE}</p>
      </div>
      <label className="consent-checkbox" htmlFor={inputId}>
        <input
          id={inputId}
          ref={inputRef}
          type="checkbox"
          name={field.key}
          checked={value === true}
          onChange={(event) => onChange(field.key, event.target.checked, "consent")}
          aria-describedby={describedBy}
          aria-invalid={error ? "true" : undefined}
          required
        />
        <span><FieldLabel field={field} /></span>
      </label>
      <FieldSupport field={field} error={error} />
    </section>
  );
}

function IntakeField({ field, value, error, onChange, inputRef }) {
  if (field.key === "includeWebankAssessment") {
    return <WebankToggle field={field} value={value} error={error} onChange={onChange} inputRef={inputRef} />;
  }
  if (field.type === "checkboxes") {
    return <ChoiceField field={field} value={value} error={error} onChange={onChange} inputRef={inputRef} />;
  }
  if (field.type === "boolean") {
    return <BooleanField field={field} value={value} error={error} onChange={onChange} inputRef={inputRef} />;
  }
  if (field.type === "consent") {
    return <ConsentField field={field} value={value} error={error} onChange={onChange} inputRef={inputRef} />;
  }
  return <StandardField field={field} value={value} error={error} onChange={onChange} inputRef={inputRef} />;
}

export function AmazonScStepFields({
  groups,
  stepFields,
  profile,
  errors,
  openGroupId,
  onOpenGroup,
  onChange,
  registerField,
}) {
  const toggleField = stepFields.find((field) => field.key === "includeWebankAssessment");
  const openGroup = groups.find((group) => group.id === openGroupId) ?? groups[0];
  const handleGroupKeyDown = (event, currentIndex) => {
    const targetIndex = nextIntakeGroupIndex(currentIndex, groups.length, event.key);
    if (targetIndex == null) return;
    event.preventDefault();
    onOpenGroup(groups[targetIndex].id);
    const tabs = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    tabs?.[targetIndex]?.focus();
  };

  return (
    <div className="amazon-sc-step-fields">
      {toggleField && (
        <div className="webank-assessment-control">
          <IntakeField
            field={toggleField}
            value={profile[toggleField.key]}
            error={errors[toggleField.key]}
            onChange={onChange}
            inputRef={registerField(toggleField.key)}
          />
        </div>
      )}

      <div className="intake-field-groups">
        <div className="intake-group-tabs" role="tablist" aria-label="Amazon SC 经营信息分组">
          {groups.map((group, index) => {
            const isOpen = group.id === openGroup?.id;
            const hasError = group.fields.some((field) => errors[field.key]);
            return (
              <button
                className={`intake-group-tab ${isOpen ? "current" : ""} ${hasError ? "has-error" : ""}`}
                id={`intake-group-${group.id}-tab`}
                key={group.id}
                type="button"
                role="tab"
                aria-selected={isOpen ? "true" : "false"}
                aria-expanded={isOpen ? "true" : "false"}
                aria-controls={`intake-group-${group.id}-panel`}
                tabIndex={isOpen ? 0 : -1}
                onClick={() => onOpenGroup(group.id)}
                onKeyDown={(event) => handleGroupKeyDown(event, index)}
              >
                <span>{String(index + 1).padStart(2, "0")} · {group.title}</span>
                <small>{groupCompletion(group, profile, errors)}</small>
              </button>
            );
          })}
        </div>

        {groups.map((group) => {
          const isOpen = group.id === openGroup?.id;
          return (
            <section
              className="intake-group-panel"
              id={`intake-group-${group.id}-panel`}
              key={group.id}
              role="tabpanel"
              aria-labelledby={`intake-group-${group.id}-tab`}
              hidden={!isOpen}
            >
              <div className="form-grid intake-fields">
                {group.fields.map((field) => (
                  <IntakeField
                    key={field.key}
                    field={field}
                    value={profile[field.key]}
                    error={errors[field.key]}
                    onChange={onChange}
                    inputRef={registerField(field.key)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function FinancingIntake({ onComplete, onInvalidate }) {
  const [profile, setProfile] = useState(initialProfile);
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [openGroupId, setOpenGroupId] = useState("financing-needs");
  const fieldRefs = useRef({});
  const stepHeadingRef = useRef(null);
  const pendingFocusKey = useRef(null);
  const pendingStepHeadingFocus = useRef(false);
  const requestVersion = useRef(0);
  const requestController = useRef(null);

  const visibleFields = useMemo(() => getVisibleIntakeFields(profile), [profile]);
  const stepFields = useMemo(
    () => visibleFields.filter((field) => field.step === currentStep),
    [currentStep, visibleFields],
  );
  const stepDefinition = INTAKE_STEPS[currentStep - 1];
  const fieldGroups = useMemo(
    () => groupIntakeStepFields(stepFields, profile),
    [profile, stepFields],
  );

  useEffect(() => {
    if (!pendingStepHeadingFocus.current) return;
    pendingStepHeadingFocus.current = false;
    focusWizardStepHeading(stepHeadingRef.current);
  }, [currentStep]);

  useEffect(() => {
    const key = pendingFocusKey.current;
    if (!key) return;
    const control = fieldRefs.current[key];
    if (control && typeof control.focus === "function") {
      control.focus();
      pendingFocusKey.current = null;
    }
  }, [currentStep, errors, openGroupId]);

  useEffect(() => () => {
    requestVersion.current += 1;
    requestController.current?.abort();
  }, []);

  const cancelPendingSubmission = () => {
    requestVersion.current += 1;
    requestController.current?.abort();
    requestController.current = null;
  };

  const registerField = (key) => (control) => {
    if (control) fieldRefs.current[key] = control;
  };

  const updateField = (key, value, type) => {
    cancelPendingSubmission();
    invalidateIntakeResult(onInvalidate, "field_change");
    if (key === "primaryBusinessModel" && value === "amazon_sc") setOpenGroupId("financing-needs");
    setProfile((current) => {
      if (key === "primaryBusinessModel") return clearInactiveIntakeValues(current, value);
      if (key === "includeWebankAssessment") {
        return clearInactiveIntakeValues({ ...current, [key]: value }, current.primaryBusinessModel);
      }
      if (type !== "checkboxes") return { ...current, [key]: value };
      const selected = Array.isArray(current[key]) ? current[key] : [];
      return {
        ...current,
        [key]: selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value],
      };
    });
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (status.type !== "idle") setStatus({ type: "idle", message: "" });
  };

  const focusErrors = (nextErrors, step = currentStep) => {
    if (nextErrors.length === 0) return false;
    pendingFocusKey.current = nextErrors[0].key;
    const targetFields = visibleFields.filter((field) => field.step === step);
    const targetGroups = groupIntakeStepFields(targetFields, profile);
    const targetGroupId = findIntakeGroupForField(targetGroups, nextErrors[0].key);
    if (targetGroupId) setOpenGroupId(targetGroupId);
    setErrors(errorMapFrom(nextErrors));
    if (step !== currentStep) setCurrentStep(step);
    return true;
  };

  const goForward = () => {
    const nextErrors = validateIntakeStep(profile, currentStep);
    if (focusErrors(nextErrors)) return;
    setErrors({});
    pendingStepHeadingFocus.current = true;
    setCurrentStep((step) => Math.min(step + 1, INTAKE_STEPS.length));
  };

  const goBack = () => {
    setErrors({});
    pendingStepHeadingFocus.current = true;
    setCurrentStep((step) => Math.max(step - 1, 1));
  };

  const submitIntake = async (event) => {
    event.preventDefault();

    if (currentStep < INTAKE_STEPS.length) {
      goForward();
      return;
    }

    const submissionErrors = INTAKE_STEPS.reduce((result, step) => (
      result.concat(validateIntakeStep(profile, step.id))
    ), []);
    if (submissionErrors.length > 0) {
      const firstInvalidField = visibleFields.find((field) => field.key === submissionErrors[0].key);
      focusErrors(submissionErrors, firstInvalidField?.step ?? currentStep);
      setStatus({ type: "error", message: "请检查标注字段后再提交。" });
      return;
    }

    const payload = buildProgressiveSubmission(profile);

    setErrors({});
    invalidateIntakeResult(onInvalidate, "submit_start");
    setStatus({ type: "loading", message: INTAKE_SUBMISSION_COPY.loading });
    cancelPendingSubmission();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    requestController.current = controller;
    const submissionVersion = requestVersion.current;

    try {
      const responsePayload = await postJson("/api/leads", payload, controller == null ? {} : { signal: controller.signal });
      if (controller?.signal.aborted || submissionVersion !== requestVersion.current) return;

      const leadResponse = responsePayload.lead;
      setStatus({
        type: "success",
        message: INTAKE_SUBMISSION_COPY.success,
      });
      if (typeof onComplete === "function") onComplete(leadResponse);
    } catch (error) {
      if (controller?.signal.aborted || submissionVersion !== requestVersion.current || error.name === "AbortError") return;
      invalidateIntakeResult(onInvalidate, "submit_failure");
      const serverErrors = Array.isArray(error.fields)
        ? error.fields
          .filter((item) => visibleFields.some((field) => field.key === item.field))
          .map((item) => ({ key: item.field, message: item.message }))
        : [];
      if (serverErrors.length > 0) {
        const firstInvalidField = visibleFields.find((field) => field.key === serverErrors[0].key);
        focusErrors(serverErrors, firstInvalidField?.step ?? currentStep);
      }
      setStatus({ type: "error", message: error.message || "提交失败，请稍后再试" });
    } finally {
      if (submissionVersion === requestVersion.current) requestController.current = null;
    }
  };

  return (
    <form className="lead-form financing-intake" onSubmit={submitIntake} noValidate data-reveal>
      <ol className="wizard-progress" aria-label="融资信息填写进度">
        {INTAKE_STEPS.map((step) => (
          <li
            key={step.id}
            className={step.id === currentStep ? "current" : step.id < currentStep ? "complete" : ""}
            aria-current={step.id === currentStep ? "step" : undefined}
          >
            <span>{step.id}</span>
            <small>{step.shortTitle}</small>
          </li>
        ))}
      </ol>

      <div className="wizard-step-heading">
        <span>第 {currentStep} 步，共 {INTAKE_STEPS.length} 步</span>
        <h3 id={`intake-step-${currentStep}-title`} ref={stepHeadingRef} tabIndex="-1">{stepDefinition.title}</h3>
        <p>系统会根据主要融资场景，只追问影响产品判断的关键信息。</p>
      </div>

      {currentStep === 2 && profile.primaryBusinessModel === "amazon_sc" ? (
        <AmazonScStepFields
          groups={fieldGroups}
          stepFields={stepFields}
          profile={profile}
          errors={errors}
          openGroupId={openGroupId}
          onOpenGroup={setOpenGroupId}
          onChange={updateField}
          registerField={registerField}
        />
      ) : fieldGroups.length === 1 && fieldGroups[0].title == null ? (
        <div className="form-grid intake-fields">
          {fieldGroups[0].fields.map((field) => (
            <IntakeField
              key={field.key}
              field={field}
              value={profile[field.key]}
              error={errors[field.key]}
              onChange={updateField}
              inputRef={registerField(field.key)}
            />
          ))}
        </div>
      ) : null}

      <div className="form-actions wizard-actions">
        <button className="wizard-back" type="button" onClick={goBack} disabled={currentStep === 1 || status.type === "loading"}>
          上一步
        </button>
        <button className="hot-button" type="submit" disabled={status.type === "loading"}>
          {status.type === "loading"
            ? "正在生成初步报告…"
            : currentStep < INTAKE_STEPS.length
              ? "下一步"
              : "生成初步报告"}
        </button>
      </div>
      <div className="form-status-slot" aria-live="polite" aria-atomic="true">
        {status.message && <p className={`form-status ${status.type}`}>{status.message}</p>}
      </div>
    </form>
  );
}
