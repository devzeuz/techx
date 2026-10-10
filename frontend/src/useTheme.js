import { useContext } from 'react';
import { ThemeContext } from './ThemeContext';

// Separate file so ThemeContext.jsx only exports components (react-refresh requirement)
export const useTheme = () => useContext(ThemeContext);
