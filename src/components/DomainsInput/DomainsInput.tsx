import { FC, useState, KeyboardEvent } from 'react';
import './DomainsInput.css';

interface Props {
  value: string[];
  onChange: (domains: string[]) => void;
  placeholder?: string;
}

export const DomainsInput: FC<Props> = ({ value, onChange, placeholder = 'example.com' }) => {
  const [inputVal, setInputVal] = useState('');

  const addDomain = (raw: string) => {
    const domain = raw.trim().toLowerCase();
    if (!domain) return;
    if (value.includes(domain)) {
      setInputVal('');
      return;
    }
    onChange([...value, domain]);
    setInputVal('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addDomain(inputVal);
    }
    if (e.key === 'Backspace' && inputVal === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (domain: string) => {
    onChange(value.filter((d) => d !== domain));
  };

  return (
    <div className="domains-input">
      <div className="domains-tags">
        {value.map((domain) => (
          <span key={domain} className="domain-tag">
            {domain}
            <button
              type="button"
              className="domain-tag-remove"
              onClick={() => remove(domain)}
              aria-label={`Remove ${domain}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="domains-tag-input"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addDomain(inputVal)}
          placeholder={value.length === 0 ? placeholder : 'Add another…'}
        />
      </div>
      <p className="domains-hint">Press Enter or comma to add a domain</p>
    </div>
  );
};
