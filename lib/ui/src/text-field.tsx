import {
  TextField as TextFieldPrimitive,
  type TextFieldProps,
} from "react-aria-components/TextField";
import { cx } from "./primitive";
import { fieldStyles } from "./field";

export function TextField({ className, ...props }: TextFieldProps) {
  return (
    <TextFieldPrimitive data-slot="control" className={cx(fieldStyles(), className)} {...props} />
  );
}
