"use client";

import { useMemo, type ElementType } from "react";
import {
  FieldError as FieldErrorPrimitive,
  type FieldErrorProps as PrimitiveFieldErrorProps,
} from "react-aria-components/FieldError";
import { Label as LabelPrimitive, type LabelProps } from "react-aria-components/Label";
import { Text, type TextProps } from "react-aria-components/Text";
import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import { tv } from "tailwind-variants";

import { Separator } from "@dpeek/formless-ui/separator";
import { cn } from "@dpeek/formless-ui/utils";

import { cx } from "./primitive";

export const labelStyles = tv({
  base: [
    "select-none text-base/6 text-fg in-data-required:not-data-[slot='control-label']:after:ml-1.5 sm:text-sm/6",
    "in-data-required:not-data-[slot='control-label']:after:text-danger-subtle-fg in-data-required:not-data-[slot='control-label']:after:content-['*']",
    "in-disabled:pointer-events-none in-disabled:opacity-50 group-disabled:opacity-50",
  ],
});

export const descriptionStyles = tv({
  base: "block text-muted-fg text-sm/6 in-disabled:opacity-50 group-disabled:opacity-50",
});

export const fieldErrorStyles = tv({
  base: "block text-danger-subtle-fg text-sm/6 in-disabled:opacity-50 group-disabled:opacity-50 forced-colors:text-[Mark]",
});

export const fieldStyles = tv({
  base: [
    "w-full",
    "[&>[data-slot=control]+[data-slot=control]]:mt-2",
    "[&>[data-slot=label]+[data-slot=control]]:mt-2",
    "[&>[data-slot=label]+[slot='description']]:mt-1",
    "[&>[slot=description]+[data-slot=control]]:mt-2",
    "[&>[data-slot=control]+[slot=description]]:mt-2",
    "[&>[data-slot=control]+[slot=errorMessage]]:mt-2",
    "*:data-[slot=label]:font-medium",
    "in-disabled:opacity-50 disabled:opacity-50",
  ],
});

export function Label({ className, ...props }: LabelProps) {
  return <LabelPrimitive data-slot="label" {...props} className={labelStyles({ className })} />;
}

export function Description({ className, ...props }: TextProps) {
  return <Text {...props} slot="description" className={descriptionStyles({ className })} />;
}

export function Fieldset({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      className={twMerge("*:data-[slot=text]:mt-1 [&>*+[data-slot=control]]:mt-6", className)}
      {...props}
    />
  );
}

export function FieldGroup({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div data-slot="control" className={twMerge("space-y-6", className)} {...props} />;
}

type FieldErrorProps = PrimitiveFieldErrorProps & {
  errors?: ReadonlyArray<{ message?: string } | undefined>;
};

export function FieldError({
  className,
  children,
  errors,
  elementType,
  ...props
}: FieldErrorProps) {
  const content = useMemo(() => {
    if (children && typeof children !== "function") {
      return children;
    }

    if (!errors?.length) {
      return null;
    }

    const uniqueErrors = [...new Map(errors.map((error) => [error?.message, error])).values()];

    if (uniqueErrors.length === 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className="ms-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map((error, index) => error?.message && <li key={index}>{error.message}</li>)}
      </ul>
    );
  }, [children, errors]);

  if (content) {
    const Element = (elementType ?? "div") as ElementType;
    const resolvedClassName =
      typeof className === "function" ? fieldErrorStyles() : twMerge(fieldErrorStyles(), className);

    return (
      <Element
        role="alert"
        slot="errorMessage"
        data-slot="field-error"
        className={resolvedClassName}
        {...props}
      >
        {content}
      </Element>
    );
  }

  return (
    <FieldErrorPrimitive
      {...props}
      elementType={elementType}
      className={cx(fieldErrorStyles(), className)}
    >
      {children}
    </FieldErrorPrimitive>
  );
}

export function Legend({ className, ...props }: React.ComponentProps<"legend">) {
  return (
    <legend
      data-slot="legend"
      {...props}
      className={twMerge("font-semibold text-base/6 data-disabled:opacity-50", className)}
    />
  );
}

const fieldVariants = cva("group/field flex w-full gap-2 data-[invalid=true]:text-destructive", {
  variants: {
    orientation: {
      vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
      horizontal:
        "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      responsive:
        "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("group/field-content flex flex-1 flex-col gap-0.5 leading-snug", className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border *:data-[slot=field]:p-2 dark:has-data-checked:bg-primary/10",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-xs/relaxed font-medium group-data-[disabled=true]/field:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<typeof Description>) {
  return (
    <Description
      data-slot="field-description"
      className={cn(
        "text-start text-xs/relaxed leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "relative -my-2 h-5 text-xs/relaxed group-data-[variant=outline]/field-group:-mb-2",
        className,
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

const FieldSet = Fieldset;
const FieldLegend = Legend;

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
};
