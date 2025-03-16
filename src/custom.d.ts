declare module '@src/components/ui/theme-provider' {
  export function useTheme(): ThemeProviderState
  export function ThemeProvider(props: ThemeProviderProps): JSX.Element
  export const initialState: ThemeProviderState
}
