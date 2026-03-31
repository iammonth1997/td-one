import { useI18n } from "~/lib/i18n";
import { LANGUAGES } from "~/lib/i18n.shared";

type LanguageSwitcherProps = {
  ariaLabel?: string;
  className?: string;
  activeClassName?: string;
  idleClassName?: string;
};

export function LanguageSwitcher({
  ariaLabel = "Language",
  className = "flex shrink-0 gap-[3px]",
  activeClassName = "border-transparent bg-white/95 text-[#B00030]",
  idleClassName = "border-white/18 bg-white/10 text-white/65",
}: LanguageSwitcherProps) {
  const { lang, setLang } = useI18n();

  return (
    <div className={className} role="group" aria-label={ariaLabel}>
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          className={`rounded-lg border px-2 py-1 text-[10px] font-semibold tracking-[0.3px] transition-all active:scale-[0.91] ${
            lang === code ? activeClassName : idleClassName
          }`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
