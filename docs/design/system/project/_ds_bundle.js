/* @ds-bundle: {"format":3,"namespace":"HealthkeeperDS_31e44b","components":[{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"Card","sourcePath":"components/data/Card.jsx"},{"name":"EmptyState","sourcePath":"components/data/EmptyState.jsx"},{"name":"SlotButton","sourcePath":"components/data/SlotButton.jsx"},{"name":"Tabs","sourcePath":"components/data/Tabs.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"StatusBadge","sourcePath":"components/feedback/StatusBadge.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"IconButton","sourcePath":"components/forms/IconButton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"}],"sourceHashes":{"components/data/Avatar.jsx":"25718515ac1c","components/data/Card.jsx":"ebd6ae4bbe1a","components/data/EmptyState.jsx":"251c20ca862a","components/data/SlotButton.jsx":"a7d1a728a2d1","components/data/Tabs.jsx":"7e1c17dce830","components/feedback/Alert.jsx":"71e218da64c6","components/feedback/Badge.jsx":"9719efa947d6","components/feedback/Dialog.jsx":"73411a375c31","components/feedback/StatusBadge.jsx":"a6f6b574d1c9","components/feedback/Toast.jsx":"d613a0b05d4b","components/forms/Button.jsx":"a5f49bbdbcc0","components/forms/Checkbox.jsx":"8f740dc01b45","components/forms/IconButton.jsx":"704d51d57448","components/forms/Input.jsx":"05dcacf56545","components/forms/Select.jsx":"296cee05dc86","components/forms/Switch.jsx":"b9114bfb61a0","components/forms/Textarea.jsx":"e039ba398ba1"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.HealthkeeperDS_31e44b = window.HealthkeeperDS_31e44b || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/data/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Avatar — circular initials or image.
 */
function Avatar({
  name = "",
  src,
  size = "md",
  className = "",
  ...rest
}) {
  const initials = name.trim().slice(0, 2);
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ["hk-avatar", `hk-avatar--${size}`, className].filter(Boolean).join(" ")
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name
  }) : /*#__PURE__*/React.createElement("span", null, initials));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — elevated surface container.
 */
function Card({
  padded = true,
  hover = false,
  flat = false,
  as = "div",
  className = "",
  children,
  ...rest
}) {
  const Tag = as;
  const cls = ["hk-card", padded ? "hk-card--pad" : "", hover ? "hk-card--hover" : "", flat ? "hk-card--flat" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Card.jsx", error: String((e && e.message) || e) }); }

// components/data/EmptyState.jsx
try { (() => {
/**
 * EmptyState — centered icon + message for empty lists / blocked states.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      padding: "48px 24px",
      gap: "8px"
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: "50%",
      background: "var(--color-fog)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--color-slate-blue)",
      marginBottom: 6
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: "var(--color-midnight-navy)"
    }
  }, title), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--text-secondary)",
      maxWidth: 320,
      lineHeight: 1.6
    }
  }, description), action && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, action));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/data/SlotButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * SlotButton — a 30-minute reservation slot in the 헬스키퍼 calendar.
 * States: available · selected · confirmed · disabled (휴가/마감/예약완료).
 */
function SlotButton({
  time,
  meta,
  state = "available",
  onClick,
  className = "",
  ...rest
}) {
  const disabled = state === "disabled" || state === "confirmed";
  const cls = ["hk-slot", state === "selected" ? "hk-slot--selected" : "", state === "confirmed" ? "hk-slot--confirmed" : "", state === "disabled" ? "hk-slot--disabled" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    onClick: disabled ? undefined : onClick,
    disabled: disabled,
    "aria-pressed": state === "selected"
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "hk-slot__time"
  }, time), meta && /*#__PURE__*/React.createElement("span", {
    className: "hk-slot__meta"
  }, meta));
}
Object.assign(__ds_scope, { SlotButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/SlotButton.jsx", error: String((e && e.message) || e) }); }

// components/data/Tabs.jsx
try { (() => {
/**
 * Tabs — underline tab bar. Controlled via `value` / `onChange`.
 * `items` is [{ value, label }].
 */
function Tabs({
  items = [],
  value,
  onChange,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: ["hk-tabs", className].filter(Boolean).join(" "),
    role: "tablist"
  }, items.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.value,
    role: "tab",
    "aria-selected": value === it.value,
    className: ["hk-tab", value === it.value ? "hk-tab--active" : ""].filter(Boolean).join(" "),
    onClick: () => onChange && onChange(it.value)
  }, it.label)));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ICONS = {
  info: /*#__PURE__*/React.createElement("path", {
    d: "M12 16v-4M12 8h.01"
  }),
  success: /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }),
  warning: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 9v4M12 17h.01"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
  })),
  danger: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m15 9-6 6M9 9l6 6"
  }))
};

/**
 * Alert — inline message banner with icon, optional title.
 */
function Alert({
  variant = "info",
  title,
  className = "",
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ["hk-alert", `hk-alert--${variant}`, className].filter(Boolean).join(" "),
    role: "status"
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "hk-alert__icon",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, variant === "info" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), ICONS.info) : ICONS[variant])), /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("div", {
    className: "hk-alert__title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "hk-alert__body"
  }, children)));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — small pill label.
 */
function Badge({
  variant = "neutral",
  dot = false,
  className = "",
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ["hk-badge", `hk-badge--${variant}`, className].filter(Boolean).join(" ")
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    className: "hk-badge__dot"
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatusBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatusBadge — maps a 헬스키퍼 reservation status to the correct
 * color + dot. Accepts the Korean status string directly.
 */
const MAP = {
  "신청": {
    variant: "warning",
    label: "신청"
  },
  "대기": {
    variant: "warning",
    label: "확정 대기"
  },
  "확정": {
    variant: "success",
    label: "확정"
  },
  "완료": {
    variant: "success",
    label: "완료"
  },
  "탈락": {
    variant: "danger",
    label: "탈락"
  },
  "취소": {
    variant: "danger",
    label: "취소"
  },
  "재신청": {
    variant: "info",
    label: "재신청"
  }
};
function StatusBadge({
  status,
  className = "",
  ...rest
}) {
  const cfg = MAP[status] || {
    variant: "neutral",
    label: status
  };
  return /*#__PURE__*/React.createElement(__ds_scope.Badge, _extends({
    variant: cfg.variant,
    dot: true,
    className: className
  }, rest), cfg.label);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Toast — compact transient notification (navy surface).
 */
function Toast({
  variant = "default",
  className = "",
  children,
  ...rest
}) {
  const icon = variant === "success" ? /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }) : variant === "danger" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m15 9-6 6M9 9l6 6"
  })) : /*#__PURE__*/React.createElement("path", {
    d: "M12 16v-4M12 8h.01"
  });
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ["hk-toast", `hk-toast--${variant}`, className].filter(Boolean).join(" "),
    role: "status"
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "hk-toast__icon",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, variant === "default" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), icon) : icon)), /*#__PURE__*/React.createElement("span", null, children));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — the primary action primitive.
 * Variants: primary (signal blue), secondary, ghost, danger.
 */
function Button({
  variant = "primary",
  size = "md",
  block = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const cls = ["hk-btn", `hk-btn--${variant}`, size === "sm" ? "hk-btn--sm" : size === "lg" ? "hk-btn--lg" : "", block ? "hk-btn--block" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cls,
    disabled: disabled
  }, rest), iconLeft, children != null && /*#__PURE__*/React.createElement("span", null, children), iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
/**
 * Dialog — centered modal with overlay, title, body, action row.
 * Controlled via `open`; render-nothing when closed.
 */
function Dialog({
  open = true,
  title,
  children,
  confirmLabel = "확인",
  cancelLabel = "취소",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
  hideCancel = false
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "hk-dialog__overlay",
    onClick: onCancel,
    role: "dialog",
    "aria-modal": "true"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hk-dialog",
    onClick: e => e.stopPropagation()
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "hk-dialog__title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "hk-dialog__body"
  }, children), /*#__PURE__*/React.createElement("div", {
    className: "hk-dialog__actions"
  }, !hideCancel && /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "secondary",
    onClick: onCancel
  }, cancelLabel), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: confirmVariant,
    onClick: onConfirm
  }, confirmLabel))));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Checkbox — labelled box with brand check glyph.
 */
function Checkbox({
  label,
  checked,
  defaultChecked,
  onChange,
  disabled,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ["hk-check", className].filter(Boolean).join(" ")
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    checked: checked,
    defaultChecked: defaultChecked,
    onChange: onChange,
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "hk-check__box",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }))), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — square, borderless control for a single icon action.
 */
function IconButton({
  label,
  children,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: ["hk-iconbtn", className].filter(Boolean).join(" "),
    "aria-label": label
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — labelled text field with optional hint and error.
 */
function Input({
  label,
  hint,
  error,
  required = false,
  id,
  className = "",
  ...rest
}) {
  const autoId = id || (label ? `f-${String(label).replace(/\s+/g, "-")}` : undefined);
  return /*#__PURE__*/React.createElement("div", {
    className: ["hk-field", error ? "hk-field--invalid" : "", className].filter(Boolean).join(" ")
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "hk-field__label",
    htmlFor: autoId
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "hk-field__req"
  }, "*")), /*#__PURE__*/React.createElement("input", _extends({
    id: autoId,
    className: "hk-input",
    "aria-invalid": !!error
  }, rest)), error ? /*#__PURE__*/React.createElement("span", {
    className: "hk-field__error"
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    className: "hk-field__hint"
  }, hint) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Select — labelled native dropdown with brand chevron.
 * Pass options as [{value, label}] or render <option> children.
 */
function Select({
  label,
  hint,
  error,
  required = false,
  options,
  id,
  className = "",
  children,
  ...rest
}) {
  const autoId = id || (label ? `s-${String(label).replace(/\s+/g, "-")}` : undefined);
  return /*#__PURE__*/React.createElement("div", {
    className: ["hk-field", error ? "hk-field--invalid" : "", className].filter(Boolean).join(" ")
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "hk-field__label",
    htmlFor: autoId
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "hk-field__req"
  }, "*")), /*#__PURE__*/React.createElement("select", _extends({
    id: autoId,
    className: "hk-select",
    "aria-invalid": !!error
  }, rest), options ? options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label)) : children), error ? /*#__PURE__*/React.createElement("span", {
    className: "hk-field__error"
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    className: "hk-field__hint"
  }, hint) : null);
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Switch — labelled on/off toggle.
 */
function Switch({
  label,
  checked,
  defaultChecked,
  onChange,
  disabled,
  className = "",
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ["hk-switch", className].filter(Boolean).join(" ")
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    checked: checked,
    defaultChecked: defaultChecked,
    onChange: onChange,
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "hk-switch__track",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hk-switch__thumb"
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Textarea — multi-line labelled field.
 */
function Textarea({
  label,
  hint,
  error,
  required = false,
  id,
  className = "",
  ...rest
}) {
  const autoId = id || (label ? `t-${String(label).replace(/\s+/g, "-")}` : undefined);
  return /*#__PURE__*/React.createElement("div", {
    className: ["hk-field", error ? "hk-field--invalid" : "", className].filter(Boolean).join(" ")
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "hk-field__label",
    htmlFor: autoId
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "hk-field__req"
  }, "*")), /*#__PURE__*/React.createElement("textarea", _extends({
    id: autoId,
    className: "hk-textarea",
    "aria-invalid": !!error
  }, rest)), error ? /*#__PURE__*/React.createElement("span", {
    className: "hk-field__error"
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    className: "hk-field__hint"
  }, hint) : null);
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.SlotButton = __ds_scope.SlotButton;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

})();
