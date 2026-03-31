import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSearchHistory, SearchHistoryRecord } from '../api/search';

interface SearchBarProps {
  initialValue?: string;
  onSearch?: (q: string) => void;
  navigateOnSearch?: boolean;
}

export function SearchBar({ initialValue = '', onSearch, navigateOnSearch = true }: SearchBarProps) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<SearchHistoryRecord[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSuggestions = useCallback(async (val: string) => {
    if (!val.trim()) {
      // Show last 8 searches
      try {
        const hist = await fetchSearchHistory();
        setSuggestions(hist.slice(0, 8));
      } catch {
        setSuggestions([]);
      }
      return;
    }
    try {
      const hist = await fetchSearchHistory(val.trim());
      setSuggestions(hist.slice(0, 8));
    } catch {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadSuggestions(q), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, loadSuggestions]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doSearch = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setOpen(false);
    if (onSearch) {
      onSearch(trimmed);
    }
    if (navigateOnSearch) {
      navigate(`/plant-care/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') doSearch(q);
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="search-bar-container" ref={containerRef}>
      <div className="search-bar-input-wrap">
        <input
          type="search"
          className="search-bar-input"
          placeholder="Search knowledge base…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <button
          className="search-bar-btn"
          onClick={() => doSearch(q)}
          aria-label="Search"
        >
          Search
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <ul className="search-suggestions">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                className="search-suggestion-item"
                onMouseDown={() => {
                  setQ(s.query);
                  doSearch(s.query);
                }}
              >
                <span className="search-suggestion-query">{s.query}</span>
                <span className="search-suggestion-count">{s.resultCount} results</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
