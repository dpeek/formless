import {
  TextField as TextFieldPrimitive,
  type TextFieldProps,
} from "react-aria-components/TextField";

import { fieldStyles } from "./field";
import { cx } from "./primitive";

export function TextField({ className, ...props }: TextFieldProps) {
  return (
    <TextFieldPrimitive data-slot="control" className={cx(fieldStyles(), className)} {...props} />
  );
}
