Underline tab bar; controlled.

```jsx
const [tab, setTab] = React.useState("general");
<Tabs value={tab} onChange={setTab} items={[
  { value: "general", label: "일반 신청" },
  { value: "reapply", label: "재신청" },
]} />
```

Active tab is signal-blue with a 2px underline.
