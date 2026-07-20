type StylexTestIdentifier = string;

const testIdentifier = (): StylexTestIdentifier => "stylex-test";

export function create<Styles>(styles: Styles): Styles {
  return styles;
}

export function createTheme(): Record<string, never> {
  return {};
}

export function defineConsts<Constants>(constants: Constants): Constants {
  return constants;
}

export function defineVars<Variables>(variables: Variables): Variables {
  return variables;
}

export function unstable_conditional<Value>(value: Value): Value {
  return value;
}

export function unstable_defineVarsNested<Variables>(variables: Variables): Variables {
  return variables;
}

export function unstable_defineConstsNested<Constants>(constants: Constants): Constants {
  return constants;
}

export function unstable_createThemeNested(): Record<string, never> {
  return {};
}

export const defineMarker = testIdentifier;
export const defaultMarker = testIdentifier;
export const keyframes = testIdentifier;
export const positionTry = testIdentifier;
export const viewTransitionClass = testIdentifier;

export function firstThatWorks<Value>(...values: Value[]): Value | undefined {
  return values[0];
}

export function props(): Record<string, never> {
  return {};
}

export function attrs(): Record<string, never> {
  return {};
}

export const when = {
  ancestor: testIdentifier,
  anySibling: testIdentifier,
  descendant: testIdentifier,
  siblingAfter: testIdentifier,
  siblingBefore: testIdentifier,
};

export const types = {
  angle: testIdentifier,
  color: testIdentifier,
  image: testIdentifier,
  integer: testIdentifier,
  length: testIdentifier,
  lengthPercentage: testIdentifier,
  number: testIdentifier,
  percentage: testIdentifier,
  resolution: testIdentifier,
  time: testIdentifier,
  transformFunction: testIdentifier,
  transformList: testIdentifier,
  url: testIdentifier,
};

export const env = Object.freeze({});
