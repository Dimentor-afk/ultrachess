import { LANGS, type Lang, getLang, setLang, t } from '../i18n';

/** The interface language; choosing another one restarts the app in it. */
export function LangSelect({ compact = false }: { compact?: boolean }) {
  return (
    <select
      className={`lang-select ${compact ? 'compact' : ''}`}
      aria-label={t('Мова')}
      value={getLang()}
      onChange={(e) => setLang(e.target.value as Lang)}
    >
      {LANGS.map((l) => (
        <option key={l.id} value={l.id}>
          {compact ? l.id.toUpperCase() : l.name}
        </option>
      ))}
    </select>
  );
}
