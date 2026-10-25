import React, { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { searchPlaces, GeocodedPlace } from '../lib/geocode';

interface PlaceAutocompleteProps {
  value: string;
  onChange: (text: string) => void;
  onSelect: (place: GeocodedPlace) => void;
  placeholder?: string;
}

export const PlaceAutocomplete: React.FC<PlaceAutocompleteProps> = ({
  value, onChange, onSelect, placeholder,
}) => {
  const [suggestions, setSuggestions] = useState<GeocodedPlace[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const justSelectedRef = useRef(false); // true right after a click-select

  useEffect(() => {
    clearTimeout(debounceRef.current);

    // Skip the search that would otherwise fire because we just
    // programmatically set `value` from a selection.
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    if (value.trim().length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const results = await searchPlaces(value);
      setSuggestions(results);
      setIsOpen(results.length > 0);
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [value]);

  const handleSelect = (s: GeocodedPlace) => {
    justSelectedRef.current = true;
    setIsOpen(false);
    setSuggestions([]);
    onChange(s.displayName);
    onSelect(s);
  };

  return (
    <div className="relative">
      <MapPin className="w-4 h-4 absolute left-3.5 top-3 text-[#A70F43]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        placeholder={placeholder}
        className="w-full bg-[#FEFCFA] border border-[#EFE6E1] rounded-full pl-10 pr-4 py-2.5 text-[#221F20] focus:outline-none focus:border-[#A70F43]"
      />
      {isOpen && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-[#EFE6E1] rounded-2xl shadow-lg max-h-56 overflow-y-auto">
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onMouseDown={() => handleSelect(s)}
              className="w-full text-left px-4 py-2.5 text-xs hover:bg-[#FFF0F3] border-b border-[#F5EFEA] last:border-0"
            >
              {s.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};