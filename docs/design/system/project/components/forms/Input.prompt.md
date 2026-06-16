Labelled text input with hint/error states. 46px tall, hairline border, blue focus ring.

```jsx
<Input label="이메일" type="email" placeholder="name@ibank.co.kr" required />
<Input label="비밀번호" type="password" hint="8자 이상 입력하세요" />
<Input label="이름" error="이름을 입력해 주세요" />
```

Props: `label`, `hint`, `error`, `required`, plus all native input attrs. Pair with `Textarea`/`Select` from the same group.
