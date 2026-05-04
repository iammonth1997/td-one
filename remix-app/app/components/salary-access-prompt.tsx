type SalaryAccessPromptProps = {
  title: string;
  description: string;
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  error?: string;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  submitLabel?: string;
  submittingLabel?: string;
  submitting?: boolean;
  className?: string;
};

export function SalaryAccessPrompt({
  title,
  description,
  password,
  onPasswordChange,
  onSubmit,
  error,
  passwordLabel = "Password",
  passwordPlaceholder = "Enter your password",
  submitLabel = "Confirm",
  submittingLabel = "Confirming...",
  submitting = false,
  className = "",
}: SalaryAccessPromptProps) {
  return (
    <div className={`space-y-3 rounded-xl border border-[#FECACA] bg-[#FFF5F5] p-4 ${className}`.trim()}>
      <div>
        <h2 className="font-bold text-[#991B1B]">{title}</h2>
        <p className="mt-1 text-sm text-[#7F1D1D]">{description}</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-[#7F1D1D]">{passwordLabel}</label>
        <input
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          className="w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder={passwordPlaceholder}
          disabled={submitting}
        />
      </div>

      {error ? <p className="text-sm text-[#B91C1C]">{error}</p> : null}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}
