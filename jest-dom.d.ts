import '@testing-library/jest-dom'

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R
      toHaveTextContent(text: string | RegExp): R
      toBeDisabled(): R
      toBeEnabled(): R
      toHaveValue(value: string | number): R
      toHaveDisplayValue(value: string | RegExp | Array<string | RegExp>): R
      toBeChecked(): R
      toHaveFocus(): R
      toHaveClass(className: string): R
      toHaveStyle(style: Record<string, any>): R
      toHaveAttribute(attribute: string, value?: string): R
    }
  }
}