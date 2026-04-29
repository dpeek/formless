import { Button, buttonVariants } from "@formless/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@formless/ui/dialog";
import { ErrorBoundary } from "@formless/ui/error-boundary";
import { Skeleton } from "@formless/ui/skeleton";
import { TextTooltip } from "@formless/ui/tooltip";
import { cn } from "@formless/ui/utils";
import { encode as encodeToon } from "@toon-format/toon";
import { Braces, CopyIcon, DownloadIcon, LinkIcon, Maximize2, Minimize2 } from "lucide-react";
import { Children, useCallback, useEffect, useMemo, useState } from "react";
import { useStickToBottom } from "use-stick-to-bottom";

type CompactOptions = {
  indentChars?: string;
  keys?: string[];
  maxDepth?: number;
  noBrackets?: boolean;
};

function stringifyCompact(
  data: any,
  depth = 0,
  { indentChars = "  ", keys = [], maxDepth = 1 }: CompactOptions = {},
): string {
  const indent = indentChars.repeat(depth + 1);
  const outdent = indentChars.repeat(depth);

  const options = { indentChars, keys, maxDepth };

  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return "[]";
    }
    if (data.length === 1) {
      const string = stringifyCompact(data[0], depth + 1, options);
      return `[${string}]`;
    }

    const items = data
      .map((item: any, index: number) => {
        const isLast = index === data.length - 1;
        const comma = isLast ? "" : ",";
        const string = stringifyCompact(item, depth + 1, options);

        return `${indent}${string}${comma}`;
      })
      .join(`\n`);
    return `[\n${items}\n${outdent}]`;
  }

  if (keys.length === 0 && depth > maxDepth) {
    return JSON.stringify(data);
  }

  // Handle objects
  if (data && typeof data === "object" && data !== null) {
    if (Object.prototype.toString.call(data) === "[object Date]") {
      return `"${(data as Date).toISOString()}"`;
    }

    const entries = Object.entries(data);
    if (entries.length === 0) {
      return "{}";
    }

    const items = entries
      .map(([key, value], index) => {
        const isLast = index === entries.length - 1;
        const comma = isLast ? "" : ",";
        const compact = keys.includes(key) || (keys.length === 0 && depth > maxDepth);
        const string = compact
          ? JSON.stringify(value)
          : stringifyCompact(value, depth + 1, options);
        return `${indent}"${key}": ${string}${comma}`;
      })
      .join(`\n`);
    return `{\n${items}\n${outdent}}`;
  }

  return JSON.stringify(data);
}

function defaultStringify(data: any) {
  return JSON.stringify(data, null, 2);
}

type JsonProps<T> = {
  className?: string;
  // formatting
  compact?: boolean;
  data: T;
  description?: string;
  href?: string;

  name?: string;
  options?: CompactOptions;
  stickToBottom?: boolean;
};

function JsonView<T>({ className, data, name, options, stickToBottom = false }: JsonProps<T>) {
  const { contentRef, scrollRef } = useStickToBottom();

  const [compact, setCompact] = useState(false);

  return (
    <div className="group relative flex h-full w-full flex-col overflow-hidden">
      <div
        className={cn(
          "relative flex w-full flex-col overflow-auto rounded-sm border p-0",
          className,
        )}
        ref={stickToBottom ? scrollRef : undefined}
      >
        <div className="relative flex h-full w-full" ref={stickToBottom ? contentRef : undefined}>
          <JsonContent compact={compact} data={data} options={options} />
        </div>
      </div>
      <JsonToolbar
        className="hover:border-border absolute top-2 right-2 rounded-md border border-transparent bg-white/25 opacity-0 backdrop-blur-md group-hover:opacity-100 hover:bg-white/75"
        compact={compact}
        data={data}
        name={name}
        onCompactChange={setCompact}
      />
    </div>
  );
}

function JsonContent<T>({ className, compact, data, options }: JsonProps<T>) {
  const { noBrackets = false } = options ?? {};
  const stringify = compact ? stringifyCompact : defaultStringify;

  const code = useMemo(() => {
    let code = "";
    let language = "json";
    let filename = "data.json";
    let syntaxHighlighting = true;

    if (typeof data === "string") {
      language = "json";
      code = data;
      filename = "data.md";
      syntaxHighlighting = false;
    } else {
      try {
        if (data === null) {
          code = "null";
        } else if (data === undefined) {
          code = "undefined";
        } else if (compact) {
          code = encodeToon(data);
        } else {
          code = stringify(data, 0, options);
        }

        if (noBrackets) {
          code = code.replace(/^[[{]\n/, "").replace(/\n[\]}]$/, "");
        }
      } catch (error) {
        code = JSON.stringify(error, null, 2);
      }
    }

    return [
      {
        code,
        filename,
        language,
        syntaxHighlighting,
      },
    ];
  }, [data, compact, stringify, noBrackets, options]);

  return (
    <div
      className={cn("overflow-scroll border-0", className)}
      defaultValue={code[0]?.language ?? "json"}
    >
      <div className="bg-transparent p-2 font-mono text-xs">
        <pre>{code[0]?.code ?? ""}</pre>
      </div>
    </div>
  );
}

function JsonToolbar<T>({
  className,
  compact = false,

  data,
  href,
  name,
  onCompactChange,
}: JsonProps<T> & {
  onCompactChange?: (compact: boolean) => void;
}) {
  const [value, setValue] = useState(compact);

  useEffect(() => {
    setValue(compact);
  }, [compact]);

  return (
    <div className={cn("flex flex-row gap-1 p-1", className)}>
      <TextTooltip text="Expand / contract">
        <Button
          className="size-8 p-0"
          onClick={() => {
            setValue((value) => !value);
            onCompactChange?.(!value);
          }}
          size="icon"
          variant="ghost"
        >
          {value ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
        </Button>
      </TextTooltip>
      <JsonDownloadButton data={data} name={name ?? href} />
      <JsonCopyToClipboard data={data} />
      {href && (
        <TextTooltip text="Open url in new tab">
          <a
            className={cn(buttonVariants({ variant: "ghost" }))}
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            <LinkIcon size={16} />
          </a>
        </TextTooltip>
      )}
    </div>
  );
}

function JsonDownloadButton({
  data,
  disabled,
  name = "data",
}: {
  data: any;
  disabled?: boolean;
  name?: string;
}) {
  const onDownload = () => {
    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const node = document.createElement("a");
    node.setAttribute("href", dataStr);
    node.setAttribute("download", name + ".json");
    document.body.append(node); // required for firefox
    node.click();
    node.remove();
  };

  return (
    <TextTooltip text="Download json">
      <Button
        aria-label="download json"
        className="size-8 p-0"
        disabled={disabled}
        onClick={onDownload}
        size="icon"
        variant="ghost"
      >
        <DownloadIcon size={18} />
      </Button>
    </TextTooltip>
  );
}

function JsonCopyToClipboard({ data, disabled }: { data: any; disabled?: boolean }) {
  const onCopyToClipboard = () => {
    void navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  return (
    <TextTooltip text="Copy json to clipboard">
      <Button
        aria-label="copy data to clipboard"
        className="size-8 p-0"
        disabled={disabled}
        onClick={onCopyToClipboard}
        size="icon"
        variant="ghost"
      >
        <CopyIcon size={18} />
      </Button>
    </TextTooltip>
  );
}

function JsonButton<T>({
  children,
  data,
  dataFn,
  description = "",
  href,
  name = href ?? "JSON",
  options,
  triggerClassName: _,
  ...rest
}: JsonProps<T> & {
  children?: React.ReactNode;
  dataFn?: () => Promise<T> | T;
  triggerClassName?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const [compact, setCompact] = useState(rest?.compact ?? false);
  const [value, setValue] = useState<T | null>(null);

  const onOpen = useCallback(
    async (opened: boolean) => {
      setOpened(opened);

      if (!opened) {
        return;
      }

      setLoading(true);

      if (dataFn) {
        const res = await (dataFn as () => Promise<T>)();
        setValue(res);
        setLoading(false);
      } else {
        setValue(data ?? null);
        setLoading(false);
      }
    },
    [dataFn, data],
  );

  const hasChildren = Children.count(children) > 0;

  return (
    <Dialog onOpenChange={onOpen} open={opened}>
      <DialogTrigger
        render={
          !hasChildren
            ? (triggerProps) => (
                <Button
                  {...triggerProps}
                  aria-label={`Show ${name}`}
                  className={cn(
                    "flex size-8 flex-row items-center gap-2 p-0",
                    triggerProps.className,
                  )}
                  disabled={!data || typeof data !== "object"}
                  size="icon"
                  variant="ghost"
                >
                  <Braces />
                </Button>
              )
            : undefined
        }
      >
        {hasChildren && (
          <div className="group -m-1 flex flex-row items-center gap-2 rounded-md p-1 hover:bg-black/5">
            {children}
          </div>
        )}
      </DialogTrigger>
      <DialogContent className="m-4 flex h-full w-full flex-col" showCloseButton>
        <ErrorBoundary fallback={<div>Error</div>}>
          <div className="-mt-5 flex w-full flex-row items-center justify-between p-2 py-0">
            <DialogHeader className="">
              <DialogTitle>{name}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-row items-center">
              {value && (
                <JsonToolbar
                  compact={compact}
                  data={value ?? ({} as T)}
                  href={href}
                  name={name}
                  onCompactChange={setCompact}
                />
              )}
            </div>
          </div>
          <div className="flex h-full flex-col border-t border-slate-200 p-0">
            {!opened || loading ? (
              <Skeleton className="h-full w-full" />
            ) : value ? (
              <JsonContent compact={compact} data={value as T} options={options} />
            ) : (
              <span>No data</span>
            )}
          </div>
        </ErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}

export { JsonButton, JsonContent, JsonCopyToClipboard, JsonDownloadButton, JsonView };
