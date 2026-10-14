declare module 'fast-formula-parser' {
  interface CellRef {
    sheet: string
    row: number
    col: number
  }
  interface RangeRef {
    sheet: string
    from: { row: number; col: number }
    to: { row: number; col: number }
  }
  export class FormulaError {
    constructor(error: string, details?: unknown)
    readonly error: string
    toString(): string
  }
  export class DepParser {
    parse(formula: string, position: CellRef): (CellRef | RangeRef)[]
  }
  export const SSF: {
    format(fmt: string | number, value: unknown): string
  }
  export default class FormulaParser {
    constructor(config: {
      onCell?: (ref: CellRef) => unknown
      onRange?: (ref: RangeRef) => unknown[][]
      functions?: Record<string, (...args: unknown[]) => unknown>
    })
    parse(formula: string, position: CellRef, allowReturnArray?: boolean): unknown
  }
}
