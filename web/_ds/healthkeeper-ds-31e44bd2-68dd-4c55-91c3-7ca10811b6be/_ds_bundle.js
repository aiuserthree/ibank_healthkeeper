/* @ds-bundle: {"format":3,"namespace":"HealthkeeperDS_31e44b","components":[{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"Card","sourcePath":"components/data/Card.jsx"},{"name":"EmptyState","sourcePath":"components/data/EmptyState.jsx"},{"name":"SlotButton","sourcePath":"components/data/SlotButton.jsx"},{"name":"Tabs","sourcePath":"components/data/Tabs.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"StatusBadge","sourcePath":"components/feedback/StatusBadge.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"IconButton","sourcePath":"components/forms/IconButton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"}],"sourceHashes":{"components/data/Avatar.jsx":"25718515ac1c","components/data/Card.jsx":"ebd6ae4bbe1a","components/data/EmptyState.jsx":"251c20ca862a","components/data/SlotButton.jsx":"a7d1a728a2d1","components/data/Tabs.jsx":"7e1c17dce830","components/feedback/Alert.jsx":"71e218da64c6","components/feedback/Badge.jsx":"9719efa947d6","components/feedback/Dialog.jsx":"73411a375c31","components/feedback/StatusBadge.jsx":"a6f6b574d1c9","components/feedback/Toast.jsx":"d613a0b05d4b","components/forms/Button.jsx":"a5f49bbdbcc0","components/forms/Checkbox.jsx":"8f740dc01b45","components/forms/IconButton.jsx":"704d51d57448","components/forms/Input.jsx":"05dcacf56545","components/forms/Select.jsx":"296cee05dc86","components/forms/Switch.jsx":"b9114bfb61a0","components/forms/Textarea.jsx":"e039ba398ba1","ui_kits/admin/app.jsx":"0c2aa93235c5","ui_kits/member/app.jsx":"c762236673c3"},"inlinedExternals":[],"unexposedExports":[]} */

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

// ui_kits/admin/app.jsx
try { (() => {
/* 헬스키퍼 — 관리자 콘솔 (admin console)
   Composes design-system primitives from window.HealthkeeperDS_31e44b. */
const DS = window.HealthkeeperDS_31e44b;
const {
  Button,
  IconButton,
  Input,
  Switch,
  Card,
  Avatar,
  Badge,
  StatusBadge,
  Alert,
  Toast,
  Dialog,
  Tabs,
  EmptyState
} = DS;
const {
  useState,
  useEffect
} = React;
function Icon({
  name,
  size = 18,
  color,
  style
}) {
  return /*#__PURE__*/React.createElement("i", {
    "data-lucide": name,
    style: {
      width: size,
      height: size,
      color,
      display: "inline-flex",
      ...style
    }
  });
}
function useIcons() {
  useEffect(() => {
    window.lucide && window.lucide.createIcons();
  });
}

/* ---- mock data ---- */
const DAYS = [{
  d: "월",
  date: "6/22"
}, {
  d: "화",
  date: "6/23"
}, {
  d: "수",
  date: "6/24"
}, {
  d: "목",
  date: "6/25"
}, {
  d: "금",
  date: "6/26"
}];
const TIMES = ["13:30", "14:30", "15:30", "16:30"];

// applications keyed by "date-time": list of applicants
const SEED = {
  "6/22-13:30": [{
    name: "김민수",
    email: "minsu.kim@ibank.co.kr",
    applied: "09:02",
    lastUse: "2025.03.11",
    priority: true
  }, {
    name: "이서연",
    email: "seoyeon.lee@ibank.co.kr",
    applied: "09:05",
    lastUse: "2025.05.20",
    priority: false
  }],
  "6/22-14:30": [{
    name: "박지훈",
    email: "jihoon.park@ibank.co.kr",
    applied: "09:01",
    lastUse: "이력 없음",
    priority: true
  }],
  "6/22-15:30": [{
    name: "최유진",
    email: "yujin.choi@ibank.co.kr",
    applied: "09:33",
    lastUse: "2025.04.02",
    priority: true
  }, {
    name: "정현우",
    email: "hyunwoo.jung@ibank.co.kr",
    applied: "10:11",
    lastUse: "2025.04.28",
    priority: false
  }, {
    name: "강다은",
    email: "daeun.kang@ibank.co.kr",
    applied: "11:40",
    lastUse: "2025.06.01",
    priority: false
  }],
  "6/22-16:30": []
};

/* =========================================================
   Sidebar
   ========================================================= */
function Sidebar({
  route,
  go
}) {
  useIcons();
  const items = [{
    k: "dashboard",
    label: "대시보드",
    icon: "layout-dashboard"
  }, {
    k: "reservations",
    label: "예약 관리",
    icon: "calendar-check"
  }, {
    k: "vacation",
    label: "휴가 관리",
    icon: "palmtree"
  }, {
    k: "settings",
    label: "운영 설정",
    icon: "settings"
  }];
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 240,
      background: "var(--surface-card)",
      borderRight: "1px solid var(--border-default)",
      display: "flex",
      flexDirection: "column",
      position: "sticky",
      top: 0,
      height: "100vh"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "22px 20px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      borderBottom: "1px solid var(--border-default)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "34",
    height: "34",
    alt: ""
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: "var(--color-midnight-navy)",
      lineHeight: 1.1
    }
  }, "\uD5EC\uC2A4\uD0A4\uD37C"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--text-muted)",
      letterSpacing: "0.04em"
    }
  }, "ADMIN"))), /*#__PURE__*/React.createElement("nav", {
    style: {
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 2,
      flex: 1
    }
  }, items.map(it => {
    const active = route === it.k;
    return /*#__PURE__*/React.createElement("button", {
      key: it.k,
      onClick: () => go(it.k),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 14px",
        borderRadius: "var(--radius-sm)",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        font: "inherit",
        fontSize: 15,
        fontWeight: 600,
        background: active ? "var(--color-signal-blue-soft)" : "transparent",
        color: active ? "var(--color-info-blue)" : "var(--color-slate-blue)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: it.icon,
      size: 19,
      color: active ? "var(--color-signal-blue)" : "var(--color-slate-blue)"
    }), it.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      borderTop: "1px solid var(--border-default)",
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "\uAD00\uB9AC\uC790",
    size: "sm"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--color-midnight-navy)"
    }
  }, "\uC6B4\uC601 \uAD00\uB9AC\uC790"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--text-muted)"
    }
  }, "admin@ibank.co.kr")), /*#__PURE__*/React.createElement(IconButton, {
    label: "\uB85C\uADF8\uC544\uC6C3"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "log-out",
    size: 18
  }))));
}
function PageHead({
  title,
  sub,
  right
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 30
    }
  }, title), sub && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      color: "var(--text-secondary)",
      marginTop: 6
    }
  }, sub)), right);
}

/* =========================================================
   Dashboard
   ========================================================= */
function Stat({
  icon,
  tint,
  n,
  label
}) {
  return /*#__PURE__*/React.createElement(Card, {
    padded: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: 11,
      background: tint.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 22,
    color: tint.fg
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 700,
      color: "var(--color-midnight-navy)",
      lineHeight: 1
    }
  }, n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--text-secondary)",
      marginTop: 4
    }
  }, label))));
}
function Dashboard({
  go
}) {
  useIcons();
  const pending = [{
    slot: "6/22(월) 15:30",
    count: 3
  }, {
    slot: "6/22(월) 13:30",
    count: 2
  }, {
    slot: "6/23(화) 14:30",
    count: 2
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHead, {
    title: "\uB300\uC2DC\uBCF4\uB4DC",
    sub: "\uC774\uBC88 \uC8FC \uC608\uC57D \uD604\uD669 \uC694\uC57D \xB7 6/22(\uC6D4) \u2013 6/26(\uAE08)"
  }), /*#__PURE__*/React.createElement(Alert, {
    variant: "warning",
    title: "\uD655\uC815 \uB300\uAE30 \uC911\uC778 \uC2E0\uCCAD\uC774 \uC788\uC2B5\uB2C8\uB2E4"
  }, "\uB9C8\uAC10(\uC218\uC694\uC77C 17:00) \uC804\uAE4C\uC9C0 \uC6B0\uC120\uAD8C\uC744 \uD655\uC778\uD558\uACE0 \uC608\uC57D\uC744 \uD655\uC815\uD574 \uC8FC\uC138\uC694."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 16,
      margin: "20px 0 28px"
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    icon: "inbox",
    n: "24",
    label: "\uC774\uBC88 \uC8FC \uC2E0\uCCAD",
    tint: {
      bg: "var(--color-signal-blue-soft)",
      fg: "var(--color-signal-blue)"
    }
  }), /*#__PURE__*/React.createElement(Stat, {
    icon: "circle-check-big",
    n: "9",
    label: "\uD655\uC815 \uC644\uB8CC",
    tint: {
      bg: "var(--color-success-soft)",
      fg: "var(--color-success)"
    }
  }), /*#__PURE__*/React.createElement(Stat, {
    icon: "hourglass",
    n: "7",
    label: "\uD655\uC815 \uB300\uAE30",
    tint: {
      bg: "var(--color-warning-soft)",
      fg: "var(--color-warning)"
    }
  }), /*#__PURE__*/React.createElement(Stat, {
    icon: "user-x",
    n: "8",
    label: "\uD0C8\uB77D",
    tint: {
      bg: "var(--color-danger-soft)",
      fg: "var(--color-danger)"
    }
  })), /*#__PURE__*/React.createElement(Card, {
    padded: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 20
    }
  }, "\uD655\uC815 \uB300\uAE30 \uC2AC\uB86F"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    onClick: () => go("reservations"),
    iconRight: /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-right",
      size: 16,
      color: "var(--color-midnight-navy)"
    })
  }, "\uC608\uC57D \uAD00\uB9AC\uB85C \uC774\uB3D9")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, pending.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "12px 16px",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-sm)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 18,
    color: "var(--color-slate-blue)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: "var(--color-midnight-navy)"
    }
  }, p.slot), /*#__PURE__*/React.createElement(Badge, {
    variant: "warning"
  }, "\uC911\uBCF5 \uC2E0\uCCAD ", p.count, "\uBA85"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => go("reservations")
  }, "\uC6B0\uC120\uAD8C \uD655\uC778"))))));
}

/* =========================================================
   Reservation management
   ========================================================= */
function Reservations() {
  useIcons();
  const [date, setDate] = useState("6/22");
  const [data, setData] = useState(SEED);
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null); // {key, idx, name}

  const flash = m => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };
  const confirmApplicant = () => {
    const {
      key,
      idx
    } = dialog;
    setData(d => {
      const list = d[key].map((a, i) => ({
        ...a,
        status: i === idx ? "확정" : a.status === "확정" ? "확정" : "탈락"
      }));
      return {
        ...d,
        [key]: list
      };
    });
    flash(`${dialog.name}님 예약을 확정했습니다 · 완료 메일 발송`);
    setDialog(null);
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHead, {
    title: "\uC608\uC57D \uAD00\uB9AC",
    sub: "\uB0A0\uC9DC\uBCC4 \uC2E0\uCCAD \uD604\uD669 \xB7 \uC6B0\uC120\uAD8C\uC744 \uD655\uC778\uD558\uACE0 \uD655\uC815\uD558\uC138\uC694",
    right: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "mail",
        size: 16,
        color: "var(--color-midnight-navy)"
      })
    }, "\uD0C8\uB77D\uC790 \uC7AC\uC2E0\uCCAD \uC548\uB0B4 \uBA54\uC77C")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 20
    }
  }, DAYS.map(dy => /*#__PURE__*/React.createElement("button", {
    key: dy.date,
    onClick: () => setDate(dy.date),
    style: {
      padding: "10px 16px",
      borderRadius: "var(--radius-sm)",
      cursor: "pointer",
      font: "inherit",
      border: "1px solid " + (date === dy.date ? "var(--color-signal-blue)" : "var(--border-default)"),
      background: date === dy.date ? "var(--color-signal-blue)" : "var(--surface-card)",
      color: date === dy.date ? "#fff" : "var(--color-midnight-navy)",
      fontWeight: 600,
      fontSize: 14
    }
  }, dy.d, " ", dy.date))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, TIMES.map(t => {
    const key = `${date}-${t}`;
    const list = (data[key] || []).slice().sort((a, b) => {
      if (a.lastUse === "이력 없음") return -1;
      if (b.lastUse === "이력 없음") return 1;
      return a.lastUse < b.lastUse ? -1 : 1;
    });
    const confirmed = list.find(a => a.status === "확정");
    return /*#__PURE__*/React.createElement(Card, {
      key: t,
      padded: true
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: list.length ? 16 : 0
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "clock",
      size: 18,
      color: "var(--color-signal-blue)"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 17,
        fontWeight: 700,
        color: "var(--color-midnight-navy)"
      }
    }, t, " \u2013 ", endT(t)), list.length > 1 && /*#__PURE__*/React.createElement(Badge, {
      variant: "warning"
    }, "\uC911\uBCF5 ", list.length, "\uBA85"), confirmed && /*#__PURE__*/React.createElement(Badge, {
      variant: "success",
      dot: true
    }, "\uD655\uC815 \uC644\uB8CC"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), !list.length && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: "var(--text-muted)"
      }
    }, "\uC2E0\uCCAD \uC5C6\uC74C")), list.length > 0 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Row, {
      head: true
    }), list.map((a, i) => /*#__PURE__*/React.createElement(Row, {
      key: a.email,
      a: a,
      rank: i,
      confirmedExists: !!confirmed,
      onConfirm: () => setDialog({
        key,
        idx: data[key].indexOf(a),
        name: a.name
      })
    }))));
  })), /*#__PURE__*/React.createElement(Dialog, {
    open: !!dialog,
    title: "\uC608\uC57D\uC744 \uD655\uC815\uD560\uAE4C\uC694?",
    confirmLabel: "\uD655\uC815\uD558\uAE30",
    onConfirm: confirmApplicant,
    onCancel: () => setDialog(null)
  }, dialog && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("b", null, dialog.name), "\uB2D8\uC744 \uD655\uC815\uD569\uB2C8\uB2E4. \uAC19\uC740 \uC2AC\uB86F\uC758 \uB2E4\uB978 \uC2E0\uCCAD\uC790\uB294 ", /*#__PURE__*/React.createElement("b", null, "\uD0C8\uB77D"), " \uCC98\uB9AC\uB418\uBA70, \uD655\uC815\uC790\uC5D0\uAC8C \uC644\uB8CC \uBA54\uC77C\uC774 \uBC1C\uC1A1\uB429\uB2C8\uB2E4.")), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 28,
      left: "calc(50% + 120px)",
      transform: "translateX(-50%)",
      zIndex: 200
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    variant: "success"
  }, toast)));
}
function Row({
  head,
  a,
  rank,
  confirmedExists,
  onConfirm
}) {
  const grid = "28px 1.4fr 1fr 92px 110px 84px 96px";
  if (head) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: grid,
        gap: 12,
        padding: "0 8px 10px",
        borderBottom: "1px solid var(--border-default)"
      }
    }, ["", "신청자", "신청 시각", "마지막 이용", "우선권", "상태", ""].map((h, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        fontSize: 12,
        fontWeight: 700,
        color: "var(--text-muted)",
        letterSpacing: "0.03em"
      }
    }, h)));
  }
  const status = a.status || "신청";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: grid,
      gap: 12,
      padding: "12px 8px",
      alignItems: "center",
      borderBottom: "1px solid var(--color-mist)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: rank === 0 ? "var(--color-signal-blue)" : "var(--text-muted)"
    }
  }, rank + 1), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: a.name,
    size: "sm"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: "var(--color-midnight-navy)"
    }
  }, a.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, a.email))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--text-secondary)",
      fontVariantNumeric: "tabular-nums"
    }
  }, a.applied), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: a.lastUse === "이력 없음" ? "var(--color-warning)" : "var(--text-secondary)",
      fontWeight: a.lastUse === "이력 없음" ? 700 : 400
    }
  }, a.lastUse), /*#__PURE__*/React.createElement("div", null, a.priority ? /*#__PURE__*/React.createElement(Badge, {
    variant: "info"
  }, "\uC6B0\uC120\uAD8C O") : /*#__PURE__*/React.createElement(Badge, {
    variant: "neutral"
  }, "X")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(StatusBadge, {
    status: status
  })), /*#__PURE__*/React.createElement("div", null, status === "확정" ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--color-success)",
      fontWeight: 700
    }
  }, "\uC644\uB8CC") : status === "탈락" ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, "\u2014") : /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    onClick: onConfirm
  }, "\uD655\uC815")));
}
function endT(t) {
  const [h, m] = t.split(":").map(Number);
  return `${String(h + (m + 30 >= 60 ? 1 : 0)).padStart(2, "0")}:${String((m + 30) % 60).padStart(2, "0")}`;
}

/* =========================================================
   Vacation management
   ========================================================= */
function Vacation() {
  useIcons();
  const [off, setOff] = useState({
    "6/24": true
  });
  const toggle = d => setOff(o => ({
    ...o,
    [d]: !o[d]
  }));
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHead, {
    title: "\uD734\uAC00 \uAD00\uB9AC",
    sub: "\uC608\uC57D \uC624\uD508(\uC218\uC694\uC77C 09:00) \uC804\uC5D0\uB9CC \uC548\uB9C8\uC0AC \uD734\uAC00\uB97C \uC9C0\uC815\uD560 \uC218 \uC788\uC5B4\uC694"
  }), /*#__PURE__*/React.createElement(Alert, {
    variant: "info",
    title: "\uCC28\uC8FC \uC77C\uC815 \xB7 6/22(\uC6D4) \u2013 6/26(\uAE08)"
  }, "\uD734\uAC00\uB85C \uC9C0\uC815\uD55C \uB0A0\uC9DC\uB294 \uD68C\uC6D0 \uC608\uC57D \uD654\uBA74\uC5D0\uC11C ", /*#__PURE__*/React.createElement("b", null, "\uC608\uC57D \uBD88\uAC00"), "\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4. \uC624\uD508 \uD6C4\uC5D0\uB294 \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5,1fr)",
      gap: 16,
      marginTop: 24
    }
  }, DAYS.map(dy => {
    const isOff = !!off[dy.date];
    return /*#__PURE__*/React.createElement(Card, {
      key: dy.date,
      padded: true,
      style: {
        borderColor: isOff ? "var(--color-danger)" : "var(--border-default)",
        background: isOff ? "var(--color-danger-soft)" : "var(--surface-card)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 22,
        fontWeight: 700,
        color: "var(--color-midnight-navy)"
      }
    }, dy.d), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--text-muted)",
        marginBottom: 16
      }
    }, dy.date), isOff ? /*#__PURE__*/React.createElement(Badge, {
      variant: "danger",
      dot: true
    }, "\uD734\uAC00") : /*#__PURE__*/React.createElement(Badge, {
      variant: "success",
      dot: true
    }, "\uC6B4\uC601"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 18,
        display: "flex",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement(Switch, {
      checked: isOff,
      onChange: () => toggle(dy.date)
    }))));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 28,
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary"
  }, "\uD734\uAC00 \uC800\uC7A5"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary"
  }, "\uBCC0\uACBD \uCDE8\uC18C")));
}

/* =========================================================
   Settings (light)
   ========================================================= */
function Settings() {
  useIcons();
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHead, {
    title: "\uC6B4\uC601 \uC124\uC815",
    sub: "\uC6B4\uC601 \uC2DC\uAC04 \xB7 \uC624\uD508/\uB9C8\uAC10 \xB7 \uBA54\uC77C \uD15C\uD50C\uB9BF (\uD655\uC7A5)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
      maxWidth: 760
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padded: true
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 18,
      marginBottom: 16
    }
  }, "\uC6B4\uC601 \uC2DC\uAC04"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uC6B4\uC601 \uC2DC\uC791",
    defaultValue: "13:30"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uC6B4\uC601 \uC885\uB8CC",
    defaultValue: "17:00"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uD0C0\uC784 \uAE38\uC774 (\uBD84)",
    defaultValue: "30"
  }))), /*#__PURE__*/React.createElement(Card, {
    padded: true
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 18,
      marginBottom: 16
    }
  }, "\uC624\uD508 / \uB9C8\uAC10"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uC608\uC57D \uC624\uD508",
    defaultValue: "\uC218\uC694\uC77C 09:00"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uC608\uC57D \uB9C8\uAC10",
    defaultValue: "\uC218\uC694\uC77C 17:00"
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "\uC608\uC57D \uC644\uB8CC \uBA54\uC77C \uC790\uB3D9 \uBC1C\uC1A1",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "\uD0C8\uB77D\uC790 \uC7AC\uC2E0\uCCAD \uC548\uB0B4 \uC790\uB3D9 \uBC1C\uC1A1",
    defaultChecked: true
  })))));
}

/* =========================================================
   Root
   ========================================================= */
function App() {
  const [route, setRoute] = useState("reservations");
  const go = r => setRoute(r);
  useEffect(() => {
    window.lucide && window.lucide.createIcons();
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      minHeight: "100vh"
    }
  }, /*#__PURE__*/React.createElement(Sidebar, {
    route: route,
    go: go
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      padding: "32px 40px",
      maxWidth: 1100
    }
  }, route === "dashboard" && /*#__PURE__*/React.createElement(Dashboard, {
    go: go
  }), route === "reservations" && /*#__PURE__*/React.createElement(Reservations, null), route === "vacation" && /*#__PURE__*/React.createElement(Vacation, null), route === "settings" && /*#__PURE__*/React.createElement(Settings, null)));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/member/app.jsx
try { (() => {
/* 헬스키퍼 — 회원 예약 앱 (member booking app)
   Composes the design-system primitives from window.HealthkeeperDS_31e44b. */
const DS = window.HealthkeeperDS_31e44b;
const {
  Button,
  IconButton,
  Input,
  Checkbox,
  Card,
  Avatar,
  SlotButton,
  Tabs,
  Badge,
  StatusBadge,
  Alert,
  Toast,
  Dialog,
  EmptyState
} = DS;
const {
  useState,
  useEffect
} = React;

/* ---- Lucide icon helper ---- */
function Icon({
  name,
  size = 18,
  color,
  strokeWidth = 1.75,
  style
}) {
  return /*#__PURE__*/React.createElement("i", {
    "data-lucide": name,
    style: {
      width: size,
      height: size,
      color,
      strokeWidth,
      display: "inline-flex",
      ...style
    }
  });
}
function useIcons(dep) {
  useEffect(() => {
    window.lucide && window.lucide.createIcons();
  });
}

/* ---- week data ---- */
const TIMES = ["13:30", "14:30", "15:30", "16:30"];
const DAYS = [{
  d: "월",
  date: "6/22",
  off: false
}, {
  d: "화",
  date: "6/23",
  off: false
}, {
  d: "수",
  date: "6/24",
  off: true
},
// 안마사 휴가
{
  d: "목",
  date: "6/25",
  off: false
}, {
  d: "금",
  date: "6/26",
  off: false
}];
// pre-confirmed slots (someone else booked) "dayIndex-time"
const CONFIRMED = new Set(["0-16:30", "3-13:30", "1-14:30"]);

/* =========================================================
   Header / Shell
   ========================================================= */
function Header({
  route,
  go,
  user,
  onLogout
}) {
  useIcons();
  const NavLink = ({
    to,
    children
  }) => /*#__PURE__*/React.createElement("button", {
    onClick: () => go(to),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      font: "inherit",
      fontSize: 15,
      fontWeight: 600,
      padding: "8px 4px",
      color: route === to ? "var(--color-signal-blue)" : "var(--color-midnight-navy)"
    }
  }, children);
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 72,
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border-default)",
      position: "sticky",
      top: 0,
      zIndex: 50
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1200,
      margin: "0 auto",
      height: "100%",
      padding: "0 32px",
      display: "flex",
      alignItems: "center",
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => go("landing"),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-lockup.svg",
    alt: "\uD5EC\uC2A4\uD0A4\uD37C",
    height: "34"
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      gap: 24,
      marginLeft: 8
    }
  }, /*#__PURE__*/React.createElement(NavLink, {
    to: "landing"
  }, "\uC11C\uBE44\uC2A4 \uC18C\uAC1C"), /*#__PURE__*/React.createElement(NavLink, {
    to: "reserve"
  }, "\uC608\uC57D\uD558\uAE30"), user && /*#__PURE__*/React.createElement(NavLink, {
    to: "mypage"
  }, "\uB9C8\uC774\uD398\uC774\uC9C0")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), user ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => go("mypage"),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: "none",
      border: "none",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: user.name,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: "var(--color-midnight-navy)"
    }
  }, user.name, "\uB2D8")), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: onLogout
  }, "\uB85C\uADF8\uC544\uC6C3")) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => go("login")
  }, "\uB85C\uADF8\uC778"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    onClick: () => go("signup")
  }, "\uD68C\uC6D0\uAC00\uC785"))));
}

/* =========================================================
   Landing — service intro
   ========================================================= */
function MiniCalendar() {
  return /*#__PURE__*/React.createElement(Card, {
    padded: true,
    style: {
      width: 360,
      position: "relative",
      zIndex: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 15,
      color: "var(--color-midnight-navy)"
    }
  }, "\uC774\uBC88 \uC8FC \uC608\uC57D"), /*#__PURE__*/React.createElement(Badge, {
    variant: "success",
    dot: true
  }, "\uC608\uC57D \uAC00\uB2A5")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(SlotButton, {
    time: "13:30",
    meta: "\uAC00\uB2A5"
  }), /*#__PURE__*/React.createElement(SlotButton, {
    time: "14:30",
    meta: "\uC120\uD0DD",
    state: "selected"
  }), /*#__PURE__*/React.createElement(SlotButton, {
    time: "15:30",
    meta: "\uAC00\uB2A5"
  }), /*#__PURE__*/React.createElement(SlotButton, {
    time: "16:30",
    meta: "\uC644\uB8CC",
    state: "confirmed"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      fontSize: 13,
      color: "var(--text-secondary)",
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 15,
    color: "var(--color-slate-blue)"
  }), " \uB9E4\uC77C 13:30 \u2013 17:00 \xB7 \uD558\uB8E8 4\uD0C0\uC784"));
}
function Feature({
  icon,
  title,
  desc
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      width: 44,
      height: 44,
      borderRadius: 10,
      background: "var(--color-signal-blue-soft)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 22,
    color: "var(--color-signal-blue)"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: "var(--color-midnight-navy)",
      marginBottom: 4
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "var(--text-secondary)",
      lineHeight: 1.6
    }
  }, desc)));
}
function Landing({
  go,
  user
}) {
  useIcons();
  return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 1200,
      margin: "0 auto",
      padding: "72px 32px 56px",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 48,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Badge, {
    variant: "soft"
  }, "\uC0AC\uB0B4 \uBCF5\uC9C0 \xB7 \uC548\uB9C8\uC11C\uBE44\uC2A4"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 52,
      lineHeight: 1.1,
      letterSpacing: "-0.02em",
      margin: "20px 0 16px"
    }
  }, "\uB9C8\uC74C\uAE4C\uC9C0 \uD480\uB9AC\uB294", /*#__PURE__*/React.createElement("br", null), "\uD5EC\uC2A4\uD0A4\uD37C \uC608\uC57D"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 19,
      lineHeight: 1.64,
      color: "var(--text-secondary)",
      maxWidth: 460,
      margin: "0 0 28px"
    }
  }, "\uB9E4\uC8FC \uC218\uC694\uC77C, \uCC28\uC8FC \uC548\uB9C8\uC11C\uBE44\uC2A4\uB97C \uC2E0\uCCAD\uD558\uC138\uC694. \uD55C\uC815\uB41C \uC2DC\uAC04\uC744 \uACF5\uC815\uD558\uAC8C \u2014 \uC624\uB798 \uAE30\uB2E4\uB9B0 \uBD84\uAED8 \uC6B0\uC120\uAD8C\uC744 \uB4DC\uB9BD\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: () => go(user ? "reserve" : "signup"),
    iconRight: /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-right",
      size: 18,
      color: "#fff"
    })
  }, user ? "예약하기" : "무료로 시작하기"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    onClick: () => go("reserve")
  }, "\uC608\uC57D \uD604\uD669 \uBCF4\uAE30"))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      width: 340,
      height: 300,
      background: "var(--blob-sunrise)",
      filter: "blur(40px)",
      opacity: 0.8,
      top: -30,
      right: 40
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      width: 260,
      height: 240,
      background: "var(--blob-calm)",
      filter: "blur(44px)",
      opacity: 0.7,
      bottom: -40,
      left: 30
    }
  }), /*#__PURE__*/React.createElement(MiniCalendar, null))), /*#__PURE__*/React.createElement("section", {
    style: {
      borderTop: "1px solid var(--border-default)",
      borderBottom: "1px solid var(--border-default)",
      background: "var(--surface-card)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1200,
      margin: "0 auto",
      padding: "28px 32px",
      display: "flex",
      gap: 64
    }
  }, [["주 20타임", "월~금 · 하루 4타임"], ["1명", "전담 안마사"], ["수요일 9시", "차주 예약 오픈"]].map(([n, l]) => /*#__PURE__*/React.createElement("div", {
    key: l
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32,
      fontWeight: 700,
      color: "var(--color-midnight-navy)",
      letterSpacing: "-0.01em"
    }
  }, n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--text-secondary)",
      marginTop: 2
    }
  }, l))))), /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: 1200,
      margin: "0 auto",
      padding: "64px 32px 80px"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 34,
      marginBottom: 8
    }
  }, "\uC608\uC57D\uC740 \uC774\uB807\uAC8C \uC9C4\uD589\uB3FC\uC694"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 17,
      color: "var(--text-secondary)",
      marginBottom: 40
    }
  }, "\uC2E0\uCCAD \u2192 \uD655\uC815 \u2192 \uC548\uB0B4 \uBA54\uC77C\uAE4C\uC9C0, \uACF5\uC815\uD558\uACE0 \uD22C\uBA85\uD558\uAC8C."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 32
    }
  }, /*#__PURE__*/React.createElement(Feature, {
    icon: "calendar-days",
    title: "\uC218\uC694\uC77C\uC5D0 \uC2E0\uCCAD",
    desc: "\uB9E4\uC8FC \uC218\uC694\uC77C 09:00~16:59 \uB3D9\uC548 \uCC28\uC8FC(\uC6D4~\uAE08) \uC608\uC57D\uC744 \uC2E0\uCCAD\uD569\uB2C8\uB2E4."
  }), /*#__PURE__*/React.createElement(Feature, {
    icon: "scale",
    title: "\uC6B0\uC120\uAD8C \uBC30\uBD84",
    desc: "\uAC19\uC740 \uC2DC\uAC04\uC5D0 \uBAB0\uB9AC\uBA74 \uAC00\uC7A5 \uC624\uB798 \uAE30\uB2E4\uB9B0 \uBD84\uAED8 \uC6B0\uC120\uAD8C\uC774 \uB3CC\uC544\uAC11\uB2C8\uB2E4."
  }), /*#__PURE__*/React.createElement(Feature, {
    icon: "bell-ring",
    title: "\uC7AC\uC2E0\uCCAD \uC548\uB0B4",
    desc: "\uD0C8\uB77D\uD558\uBA74 \uB2E4\uC74C\uB0A0 17\uC2DC\uAE4C\uC9C0 \uBE48 \uC2AC\uB86F\uC5D0 \uC120\uCC29\uC21C\uC73C\uB85C \uC7AC\uC2E0\uCCAD\uD560 \uC218 \uC788\uC5B4\uC694."
  }))));
}

/* =========================================================
   Auth — login / signup
   ========================================================= */
function Auth({
  mode,
  go,
  onAuth
}) {
  useIcons();
  const isSignup = mode === "signup";
  const [agree, setAgree] = useState(false);
  return /*#__PURE__*/React.createElement("main", {
    style: {
      display: "flex",
      justifyContent: "center",
      padding: "64px 24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 420
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    alt: "",
    width: "52",
    height: "52"
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 28,
      marginTop: 16
    }
  }, isSignup ? "회원가입" : "로그인"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      color: "var(--text-secondary)",
      marginTop: 6
    }
  }, isSignup ? "이메일 인증 후 예약을 신청할 수 있어요." : "헬스키퍼 예약을 이어서 진행하세요.")), /*#__PURE__*/React.createElement(Card, {
    padded: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, isSignup && /*#__PURE__*/React.createElement(Input, {
    label: "\uC774\uB984",
    placeholder: "\uD64D\uAE38\uB3D9",
    required: true
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uC774\uBA54\uC77C",
    type: "email",
    placeholder: "name@ibank.co.kr",
    required: true,
    hint: isSignup ? "회사 이메일로 인증 메일이 발송됩니다." : undefined
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uBE44\uBC00\uBC88\uD638",
    type: "password",
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    required: true
  }), isSignup && /*#__PURE__*/React.createElement(Checkbox, {
    label: "\uAC1C\uC778\uC815\uBCF4 \uC218\uC9D1\xB7\uC774\uC6A9 \uBC0F \uC11C\uBE44\uC2A4 \uC57D\uAD00\uC5D0 \uB3D9\uC758\uD569\uB2C8\uB2E4",
    checked: agree,
    onChange: e => setAgree(e.target.checked)
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    block: true,
    size: "lg",
    disabled: isSignup && !agree,
    onClick: onAuth
  }, isSignup ? "인증 메일 받기" : "로그인"))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginTop: 18,
      fontSize: 14,
      color: "var(--text-secondary)"
    }
  }, isSignup ? "이미 계정이 있으신가요? " : "아직 회원이 아니신가요? ", /*#__PURE__*/React.createElement("button", {
    onClick: () => go(isSignup ? "login" : "signup"),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      font: "inherit",
      color: "var(--color-signal-blue)",
      fontWeight: 700
    }
  }, isSignup ? "로그인" : "회원가입"))));
}

/* =========================================================
   Reserve — weekly calendar
   ========================================================= */
function Reserve({
  user,
  go,
  onReserved
}) {
  useIcons();
  const [sel, setSel] = useState(null); // {day, time}
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState(null);
  if (!user) {
    return /*#__PURE__*/React.createElement("main", {
      style: {
        maxWidth: 1200,
        margin: "0 auto",
        padding: "48px 32px"
      }
    }, /*#__PURE__*/React.createElement(Card, {
      padded: true
    }, /*#__PURE__*/React.createElement(EmptyState, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "lock"
      }),
      title: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4",
      description: "\uC608\uC57D\uC744 \uC2E0\uCCAD\uD558\uB824\uBA74 \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694.",
      action: /*#__PURE__*/React.createElement(Button, {
        variant: "primary",
        onClick: () => go("login")
      }, "\uB85C\uADF8\uC778\uD558\uAE30")
    })));
  }
  const slotState = (di, t) => {
    if (DAYS[di].off) return "disabled";
    if (CONFIRMED.has(`${di}-${t}`)) return "confirmed";
    if (sel && sel.day === di && sel.time === t) return "selected";
    return "available";
  };
  const submit = () => {
    setConfirm(false);
    onReserved({
      day: DAYS[sel.day],
      time: sel.time
    });
    setSel(null);
    setToast("예약 신청이 접수되었습니다 · 마이페이지에서 확인하세요");
    setTimeout(() => setToast(null), 3200);
  };
  return /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: 1200,
      margin: "0 auto",
      padding: "40px 32px 80px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 12,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 34
    }
  }, "\uCC28\uC8FC \uC608\uC57D"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      color: "var(--text-secondary)"
    }
  }, "6/22(\uC6D4) \u2013 6/26(\uAE08)")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20,
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement(Alert, {
    variant: "info",
    title: "\uC608\uC57D \uAC00\uB2A5 \xB7 \uC624\uB298 16:59 \uB9C8\uAC10"
  }, "\uC2E0\uCCAD\uC740 \uC811\uC218 \uD6C4 ", /*#__PURE__*/React.createElement("b", null, "\uAD00\uB9AC\uC790 \uD655\uC815"), "\uC73C\uB85C \uC644\uB8CC\uB429\uB2C8\uB2E4. \uAC19\uC740 \uC2DC\uAC04\uC5D0 \uC2E0\uCCAD\uC774 \uBAB0\uB9AC\uBA74 \uB9C8\uC9C0\uB9C9 \uC774\uC6A9\uC77C\uC774 \uC624\uB798\uB41C \uBD84\uAED8 \uC6B0\uC120\uAD8C\uC774 \uBD80\uC5EC\uB429\uB2C8\uB2E4.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 300px",
      gap: 24,
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padded: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5,1fr)",
      gap: 12
    }
  }, DAYS.map((day, di) => /*#__PURE__*/React.createElement("div", {
    key: di
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: day.off ? "var(--text-muted)" : "var(--color-midnight-navy)"
    }
  }, day.d), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)"
    }
  }, day.date)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, day.off ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "28px 0",
      border: "1.5px dashed var(--border-default)",
      borderRadius: "var(--radius-sm)",
      color: "var(--text-muted)",
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ban",
    size: 18,
    color: "var(--color-steel-blue)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, "\uD734\uAC00")) : TIMES.map(t => /*#__PURE__*/React.createElement(SlotButton, {
    key: t,
    time: t,
    state: slotState(di, t),
    meta: CONFIRMED.has(`${di}-${t}`) ? "마감" : undefined,
    onClick: () => setSel({
      day: di,
      time: t
    }),
    style: {
      width: "100%"
    }
  }))))))), /*#__PURE__*/React.createElement(Card, {
    padded: true,
    style: {
      position: "sticky",
      top: 96
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      marginBottom: 14
    }
  }, "\uC120\uD0DD\uD55C \uC608\uC57D"), sel ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar-days",
    size: 20,
    color: "var(--color-signal-blue)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: "var(--color-midnight-navy)"
    }
  }, DAYS[sel.day].date, " (", DAYS[sel.day].d, ")")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 20,
    color: "var(--color-signal-blue)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: "var(--color-midnight-navy)"
    }
  }, sel.time, " \u2013 ", addMin(sel.time))), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    block: true,
    onClick: () => setConfirm(true)
  }, "\uC608\uC57D \uC2E0\uCCAD\uD558\uAE30"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)",
      marginTop: 12,
      lineHeight: 1.5
    }
  }, "\uC2E0\uCCAD\uC740 \uB9C8\uAC10(17:00) \uC804\uAE4C\uC9C0 \uCDE8\uC18C\uD560 \uC218 \uC788\uC5B4\uC694.")) : /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-secondary)",
      fontSize: 14,
      lineHeight: 1.6,
      padding: "8px 0 4px"
    }
  }, "\uC67C\uCABD \uCE98\uB9B0\uB354\uC5D0\uC11C \uC6D0\uD558\uB294 \uB0A0\uC9DC\xB7\uC2DC\uAC04\uC744 \uC120\uD0DD\uD558\uC138\uC694."))), /*#__PURE__*/React.createElement(Dialog, {
    open: confirm,
    title: "\uC608\uC57D\uC744 \uC2E0\uCCAD\uD560\uAE4C\uC694?",
    confirmLabel: "\uC2E0\uCCAD\uD558\uAE30",
    onConfirm: submit,
    onCancel: () => setConfirm(false)
  }, sel && /*#__PURE__*/React.createElement(React.Fragment, null, DAYS[sel.day].date, "(", DAYS[sel.day].d, ") ", /*#__PURE__*/React.createElement("b", null, sel.time), " \uD0C0\uC784\uC73C\uB85C \uC2E0\uCCAD\uD569\uB2C8\uB2E4. \uD655\uC815\uC740 \uAD00\uB9AC\uC790 \uCC98\uB9AC \uD6C4 \uC644\uB8CC\uB418\uBA70, \uC644\uB8CC \uBA54\uC77C\uC744 \uBCF4\uB0B4\uB4DC\uB824\uC694.")), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 28,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 200
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    variant: "success"
  }, toast)));
}
function addMin(t) {
  const [h, m] = t.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m + 30);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* =========================================================
   MyPage — my reservations
   ========================================================= */
function MyPage({
  user,
  go,
  reservations,
  onCancel
}) {
  useIcons();
  if (!user) {
    go("login");
    return null;
  }
  return /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: 880,
      margin: "0 auto",
      padding: "40px 32px 80px"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 34,
      marginBottom: 4
    }
  }, "\uB9C8\uC774\uD398\uC774\uC9C0"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      color: "var(--text-secondary)",
      marginBottom: 28
    }
  }, user.name, "\uB2D8\uC758 \uC608\uC57D \uC2E0\uCCAD \uB0B4\uC5ED\uC785\uB2C8\uB2E4."), /*#__PURE__*/React.createElement(Card, {
    padded: true,
    flat: true,
    style: {
      marginBottom: 20,
      background: "var(--color-mist)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 40
    }
  }, /*#__PURE__*/React.createElement(KV, {
    k: "\uB9C8\uC9C0\uB9C9 \uC774\uC6A9\uC77C",
    v: "2025.04.18"
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uC6B0\uC120\uAD8C",
    v: /*#__PURE__*/React.createElement(Badge, {
      variant: "info"
    }, "\uBCF4\uC720 O")
  }), /*#__PURE__*/React.createElement(KV, {
    k: "\uC774\uBC88 \uC8FC \uC2E0\uCCAD",
    v: `${reservations.length}건`
  }))), reservations.length === 0 ? /*#__PURE__*/React.createElement(Card, {
    padded: true
  }, /*#__PURE__*/React.createElement(EmptyState, {
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "calendar-x"
    }),
    title: "\uC2E0\uCCAD \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4",
    description: "\uC608\uC57D\uD558\uAE30\uC5D0\uC11C \uCC28\uC8FC \uC548\uB9C8\uC11C\uBE44\uC2A4\uB97C \uC2E0\uCCAD\uD574 \uBCF4\uC138\uC694.",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      onClick: () => go("reserve")
    }, "\uC608\uC57D\uD558\uB7EC \uAC00\uAE30")
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, reservations.map((r, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    padded: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 10,
      background: "var(--color-signal-blue-soft)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: "var(--color-info-blue)",
      lineHeight: 1
    }
  }, r.day.date.split("/")[1]), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "var(--color-slate-blue)"
    }
  }, r.day.d)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: "var(--color-midnight-navy)"
    }
  }, r.time, " \u2013 ", addMin(r.time)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--text-secondary)",
      marginTop: 2
    }
  }, r.type === "reapply" ? "재신청 · 즉시 확정" : "일반 신청 · 확정 대기")), /*#__PURE__*/React.createElement(StatusBadge, {
    status: r.status
  }), r.status === "신청" && /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    onClick: () => onCancel(i)
  }, "\uCDE8\uC18C"))))));
}
function KV({
  k,
  v
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)",
      marginBottom: 6
    }
  }, k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: "var(--color-midnight-navy)"
    }
  }, v));
}

/* =========================================================
   Root
   ========================================================= */
function App() {
  const [route, setRoute] = useState("landing");
  const [user, setUser] = useState(null);
  const [reservations, setReservations] = useState([]);
  const go = r => {
    setRoute(r);
    window.scrollTo(0, 0);
  };
  const login = () => {
    setUser({
      name: "김민수"
    });
    go("reserve");
  };
  const logout = () => {
    setUser(null);
    go("landing");
  };
  const addReservation = r => setReservations(rs => [...rs, {
    ...r,
    type: "general",
    status: "신청"
  }]);
  const cancel = i => setReservations(rs => rs.filter((_, idx) => idx !== i));
  useEffect(() => {
    window.lucide && window.lucide.createIcons();
  });
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Header, {
    route: route,
    go: go,
    user: user,
    onLogout: logout
  }), route === "landing" && /*#__PURE__*/React.createElement(Landing, {
    go: go,
    user: user
  }), (route === "login" || route === "signup") && /*#__PURE__*/React.createElement(Auth, {
    mode: route,
    go: go,
    onAuth: login
  }), route === "reserve" && /*#__PURE__*/React.createElement(Reserve, {
    user: user,
    go: go,
    onReserved: addReservation
  }), route === "mypage" && /*#__PURE__*/React.createElement(MyPage, {
    user: user,
    go: go,
    reservations: reservations,
    onCancel: cancel
  }), /*#__PURE__*/React.createElement("footer", {
    style: {
      borderTop: "1px solid var(--border-default)",
      background: "var(--surface-card)",
      marginTop: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1200,
      margin: "0 auto",
      padding: "28px 32px",
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "28",
    height: "28",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, "\xA9 2026 ibank Healthkeeper \xB7 \uC0AC\uB0B4 \uC548\uB9C8\uC11C\uBE44\uC2A4 \uC608\uC57D \uC2DC\uC2A4\uD15C"))));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/member/app.jsx", error: String((e && e.message) || e) }); }

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
