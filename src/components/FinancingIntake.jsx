import { useEffect, useMemo, useRef, useState } from "react";
import {
  INTAKE_STEPS,
  getVisibleIntakeFields,
  validateIntakeStep,
} from "../lib/matching/intakeSchema.js";
import { invalidateIntakeResult } from "../lib/matching/intakeLifecycle.js";
import { postJson } from "../lib/http/jsonRequest.js";

const initialProfile = {
  businessModels: [],
  platformSites: [],
  consentToDataUse: false,
};

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
      <legend>{field.label}</legend>
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
      <legend>{field.label}</legend>
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
        <span>{field.label}</span>
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
        <p>
          您提交的联系人及企业经营数据将用于融资产品匹配和融资顾问后续跟进。匹配结果仅供融资准备参考，不构成授信或放款承诺。
        </p>
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
        <span>{field.label}</span>
      </label>
      <FieldSupport field={field} error={error} />
    </section>
  );
}

function IntakeField({ field, value, error, onChange, inputRef }) {
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

export function FinancingIntake({ onComplete, onInvalidate }) {
  const [profile, setProfile] = useState(initialProfile);
  const [mode, setMode] = useState("simple");
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const fieldRefs = useRef({});
  const pendingFocusKey = useRef(null);
  const requestVersion = useRef(0);
  const requestController = useRef(null);

  const visibleFields = useMemo(() => getVisibleIntakeFields(profile, mode), [profile, mode]);
  const stepFields = useMemo(
    () => visibleFields.filter((field) => field.step === currentStep),
    [currentStep, visibleFields],
  );
  const stepDefinition = INTAKE_STEPS[currentStep - 1];

  useEffect(() => {
    const key = pendingFocusKey.current;
    if (!key) return;
    const control = fieldRefs.current[key];
    if (control && typeof control.focus === "function") {
      control.focus();
      pendingFocusKey.current = null;
    }
  }, [currentStep, errors]);

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
    setProfile((current) => {
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
    setErrors(errorMapFrom(nextErrors));
    if (step !== currentStep) setCurrentStep(step);
    return true;
  };

  const changeMode = (nextMode) => {
    if (nextMode === mode) return;
    cancelPendingSubmission();
    invalidateIntakeResult(onInvalidate, "mode_change");
    setMode(nextMode);
    setCurrentStep(1);
    setErrors({});
    setStatus({ type: "idle", message: "" });
  };

  const goForward = () => {
    const nextErrors = validateIntakeStep(profile, mode, currentStep);
    if (focusErrors(nextErrors)) return;
    setErrors({});
    setCurrentStep((step) => Math.min(step + 1, INTAKE_STEPS.length));
  };

  const goBack = () => {
    setErrors({});
    setCurrentStep((step) => Math.max(step - 1, 1));
  };

  const submitIntake = async (event) => {
    event.preventDefault();

    if (currentStep < INTAKE_STEPS.length) {
      goForward();
      return;
    }

    const submissionErrors = INTAKE_STEPS.reduce((result, step) => (
      result.concat(validateIntakeStep(profile, mode, step.id))
    ), []);
    if (submissionErrors.length > 0) {
      const firstInvalidField = visibleFields.find((field) => field.key === submissionErrors[0].key);
      focusErrors(submissionErrors, firstInvalidField?.step ?? currentStep);
      setStatus({ type: "error", message: "请检查标注字段后再提交。" });
      return;
    }

    const payload = visibleFields.reduce((result, field) => {
      const value = profile[field.key];
      if (value !== "" && value != null && (!Array.isArray(value) || value.length > 0)) {
        result[field.key] = value;
      }
      return result;
    }, { estimationMode: mode });

    setErrors({});
    invalidateIntakeResult(onInvalidate, "submit_start");
    setStatus({ type: "loading", message: "正在提交经营信息并生成匹配结果..." });
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
        message: mode === "simple" ? "信息已提交，初步匹配已生成。" : "信息已提交，融资匹配结果已生成。",
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
      <div className="estimate-mode-switch" role="group" aria-label="选择测算版本">
        <button type="button" className={mode === "simple" ? "active" : ""} aria-pressed={mode === "simple"} onClick={() => changeMode("simple")}>
          <strong>简易版</strong>
          <span>基础信息，输出初步匹配</span>
        </button>
        <button type="button" className={mode === "complex" ? "active" : ""} aria-pressed={mode === "complex"} onClick={() => changeMode("complex")}>
          <strong>复杂版</strong>
          <span>按业务展开专项资料</span>
        </button>
      </div>

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
        <h3>{stepDefinition.title}</h3>
        <p>{mode === "simple" ? "填写基础资料即可获得初步产品匹配。" : "当前字段会根据已选择的业务模式动态调整。"}</p>
      </div>

      <div className="form-grid intake-fields">
        {stepFields.map((field) => (
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

      <div className="form-actions wizard-actions">
        <button className="wizard-back" type="button" onClick={goBack} disabled={currentStep === 1 || status.type === "loading"}>
          上一步
        </button>
        <button className="hot-button" type="submit" disabled={status.type === "loading"}>
          {status.type === "loading"
            ? "正在提交..."
            : currentStep < INTAKE_STEPS.length
              ? "下一步"
              : mode === "complex"
                ? "生成融资匹配结果"
                : "生成初步匹配"}
        </button>
      </div>
      <div className="form-status-slot" aria-live="polite" aria-atomic="true">
        {status.message && <p className={`form-status ${status.type}`}>{status.message}</p>}
      </div>
    </form>
  );
}
