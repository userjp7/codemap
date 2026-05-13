// default export
export default class App {}

// named exports
export function namedFunc(): string {
  return 'hello';
}
export const CONST_VAL = 42;

// type export
type SomeType = string;
export type { SomeType };

// re-export from another module
export { helper } from './helpers';

// unexported — visible to extract_declarations but not extract_exports
function unexported(): void {}
