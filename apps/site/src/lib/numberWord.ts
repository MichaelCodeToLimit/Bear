const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty']

/** A count spelled out for copy ("Thirteen apps."), capitalised; digits beyond twenty. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n)
}
