import { useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function PinInput({ value, onChange, disabled }: Props) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const chars = [0, 1, 2, 3].map((index) => value[index] ?? "");

  const handleChange = (index: number, rawValue: string) => {
    const digit = rawValue.replace(/\D/g, "").slice(-1);
    const nextChars = [...chars];
    nextChars[index] = digit;
    const nextValue = nextChars.join("");
    onChange(nextValue);

    if (digit && index < 3) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, key: string) => {
    if (key === "Backspace" && !chars[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div className="pin-grid">
      {[0, 1, 2, 3].map((index) => (
        <input
          key={index}
          ref={(element) => {
            inputsRef.current[index] = element;
          }}
          className="pin-slot"
          type="password"
          inputMode="numeric"
          pattern="\d*"
          autoComplete="one-time-code"
          value={chars[index]}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event.key)}
          maxLength={1}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
