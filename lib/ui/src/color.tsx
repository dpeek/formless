"use client";

import { Button } from "@dpeek/formless-ui/button";
import { Dialog } from "@dpeek/formless-ui/dialog";
import { Input } from "@dpeek/formless-ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@dpeek/formless-ui/input-group";
import { Label } from "@dpeek/formless-ui/field";
import { Popover, PopoverContent } from "@dpeek/formless-ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@dpeek/formless-ui/select";
import { cn } from "@dpeek/formless-ui/utils";
import { ControlColorPickIcon, ControlLoadingIcon } from "@dpeek/formless-ui/icons";
import { useEffect, useState } from "react";
import {
  ColorArea,
  ColorThumb,
  parseColor as parseReactAriaColor,
  type Color as ReactAriaColor,
} from "react-aria-components/ColorArea";
import { ColorPicker } from "react-aria-components/ColorPicker";
import { ColorSlider, SliderTrack } from "react-aria-components/ColorSlider";

import {
  hexToRgb,
  hexToRgba,
  hslaToRgba,
  hslToRgb,
  rgbaToHex,
  rgbaToHsla,
  rgbToHex,
  rgbToHsl,
  toPickerHexColor,
} from "./color-utils";

const colorPattern = /^#[0-9A-Fa-f]{3,4}$|^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

function isValidColor(value: string): boolean {
  return colorPattern.test(value);
}

export function parseColor(value: string): string {
  if (!isValidColor(value)) {
    throw new Error("Color must be a valid hex color (e.g., #F00, #FF0000, or #FF0000FF)");
  }

  return value.toUpperCase();
}

export const colorSchema = {
  parse: parseColor,
};

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  isLoading?: boolean;
  label?: string;
  ariaLabel?: string;
  error?: string;
  className?: string;
  alpha?: boolean;
  disabled?: boolean;
  hideInputValidation?: boolean;
  name?: string;
  pickerValue?: string;
  placeholder?: string;
  required?: boolean;
}

interface ColorValues {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  rgba?: { r: number; g: number; b: number; a: number };
  hsla?: { h: number; s: number; l: number; a: number };
}

type ColorFormat = "HEX" | "HEXA" | "RGB" | "RGBA" | "HSL" | "HSLA";

const colorAreaClassName =
  "relative h-[244.79px] w-[244.79px] touch-none overflow-hidden rounded-md";
const colorSliderClassName = "h-5";
const colorSliderTrackClassName = "relative h-4 rounded overflow-hidden";
const colorAreaThumbClassName =
  "size-5 rounded-sm border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring";
const colorSliderThumbClassName =
  "h-5 w-4 rounded-sm border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring";

function toReactAriaPickerColor(value: string, alpha: boolean, fallback: string): ReactAriaColor {
  const fallbackValue = alpha ? `${toPickerHexColor(fallback, "#000000")}FF` : fallback;
  const colorValue = isValidColor(value) ? value : fallbackValue;

  try {
    return parseReactAriaColor(colorValue).toFormat(alpha ? "hexa" : "hex");
  } catch {
    return parseReactAriaColor(fallbackValue).toFormat(alpha ? "hexa" : "hex");
  }
}

function colorToHexValue(color: ReactAriaColor, alpha: boolean): string {
  return color.toString(alpha ? "hexa" : "hex").toUpperCase();
}

export function ColorInput({
  value,
  onChange,
  onBlur,
  isLoading = false,
  label,
  ariaLabel,
  error,
  className,
  alpha = false,
  disabled = false,
  hideInputValidation = false,
  name,
  pickerValue,
  placeholder,
  required = false,
}: ColorPickerProps) {
  const resolvedLabel = label ?? ariaLabel ?? "Color";
  const resolvedPickerValue = toPickerHexColor(pickerValue ?? value, "#000000");
  const reactAriaPickerValue = toReactAriaPickerColor(
    pickerValue ?? value,
    alpha,
    resolvedPickerValue,
  );
  const [colorFormat, setColorFormat] = useState<ColorFormat>(alpha ? "HEXA" : "HEX");
  const [colorValues, setColorValues] = useState<ColorValues>(() => {
    if (alpha) {
      const rgba = hexToRgba(value);
      const hsla = rgbaToHsla(rgba.r, rgba.g, rgba.b, rgba.a);
      return {
        hex: toPickerHexColor(value, resolvedPickerValue),
        rgb: { r: rgba.r, g: rgba.g, b: rgba.b },
        hsl: rgbToHsl(rgba.r, rgba.g, rgba.b),
        rgba,
        hsla,
      };
    } else {
      const rgb = hexToRgb(value);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      return {
        hex: toPickerHexColor(value, resolvedPickerValue),
        rgb,
        hsl,
      };
    }
  });
  const [hexInputValue, setHexInputValue] = useState(value);
  const [hexInputError, setHexInputError] = useState<string | null>(null);

  const updateColorValues = (newColor: string) => {
    if (alpha) {
      const rgba = hexToRgba(newColor);
      const hsla = rgbaToHsla(rgba.r, rgba.g, rgba.b, rgba.a);
      setColorValues({
        hex: toPickerHexColor(newColor, resolvedPickerValue),
        rgb: { r: rgba.r, g: rgba.g, b: rgba.b },
        hsl: rgbToHsl(rgba.r, rgba.g, rgba.b),
        rgba,
        hsla,
      });
      setHexInputValue(newColor.toUpperCase());
    } else {
      const rgb = hexToRgb(newColor);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      setColorValues({
        hex: toPickerHexColor(newColor, resolvedPickerValue),
        rgb,
        hsl,
      });
      setHexInputValue(newColor.toUpperCase());
    }
  };

  const handleColorChange = (newColor: string) => {
    updateColorValues(newColor);
    onChange(newColor);
  };

  const handleHexChange = (value: string) => {
    if (value.trim() === "" || value.trim() === "#") {
      setHexInputValue("");
      setHexInputError(null);
      onChange("");
      return;
    }

    let formattedValue = value.toUpperCase();
    if (!formattedValue.startsWith("#")) {
      formattedValue = "#" + formattedValue;
    }

    if (formattedValue.length <= 9 && /^#[0-9A-Fa-f]*$/.test(formattedValue)) {
      setHexInputValue(formattedValue);
      onChange(formattedValue);
      updateColorValues(formattedValue);
      if (isValidColor(formattedValue)) {
        setHexInputError(null);
      } else {
        setHexInputError("Enter a valid color");
      }
    }
  };

  // Handle RGB input change
  const handleRgbChange = (component: "r" | "g" | "b", value: string) => {
    const numValue = Number.parseInt(value) || 0;
    const clampedValue = Math.max(0, Math.min(255, numValue));
    const newRgb = { ...colorValues.rgb, [component]: clampedValue };
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    const hsl = rgbToHsl(newRgb.r, newRgb.g, newRgb.b);

    setColorValues({ ...colorValues, hex, rgb: newRgb, hsl });
    onChange(hex);
  };

  // Handle RGBA input change
  const handleRgbaChange = (component: "r" | "g" | "b" | "a", value: string) => {
    if (!alpha || !colorValues.rgba) return;

    const numValue = Number.parseFloat(value) || 0;
    let clampedValue;

    if (component === "a") {
      clampedValue = Math.max(0, Math.min(1, numValue));
    } else {
      clampedValue = Math.max(0, Math.min(255, Math.floor(numValue)));
    }

    const newRgba = { ...colorValues.rgba, [component]: clampedValue };
    const hex = rgbaToHex(newRgba.r, newRgba.g, newRgba.b, newRgba.a);
    const hsla = rgbaToHsla(newRgba.r, newRgba.g, newRgba.b, newRgba.a);

    setColorValues({
      ...colorValues,
      hex: hex.slice(0, 7),
      rgb: { r: newRgba.r, g: newRgba.g, b: newRgba.b },
      hsl: rgbToHsl(newRgba.r, newRgba.g, newRgba.b),
      rgba: newRgba,
      hsla,
    });
    onChange(hex);
  };

  // Handle HSL input change
  const handleHslChange = (component: "h" | "s" | "l", value: string) => {
    const numValue = Number.parseInt(value) || 0;
    let clampedValue;
    if (component === "h") {
      clampedValue = Math.max(0, Math.min(360, numValue));
    } else {
      clampedValue = Math.max(0, Math.min(100, numValue));
    }
    const newHsl = { ...colorValues.hsl, [component]: clampedValue };
    const rgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

    setColorValues({ ...colorValues, hex, rgb, hsl: newHsl });
    onChange(hex);
  };

  // Handle HSLA input change
  const handleHslaChange = (component: "h" | "s" | "l" | "a", value: string) => {
    if (!alpha || !colorValues.hsla) return;

    const numValue = Number.parseFloat(value) || 0;
    let clampedValue;

    if (component === "a") {
      clampedValue = Math.max(0, Math.min(1, numValue));
    } else if (component === "h") {
      clampedValue = Math.max(0, Math.min(360, numValue));
    } else {
      clampedValue = Math.max(0, Math.min(100, numValue));
    }

    const newHsla = { ...colorValues.hsla, [component]: clampedValue };
    const rgba = hslaToRgba(newHsla.h, newHsla.s, newHsla.l, newHsla.a);
    const hex = rgbaToHex(rgba.r, rgba.g, rgba.b, rgba.a);

    setColorValues({
      ...colorValues,
      hex: hex.slice(0, 7),
      rgb: { r: rgba.r, g: rgba.g, b: rgba.b },
      hsl: { h: newHsla.h, s: newHsla.s, l: newHsla.l },
      rgba,
      hsla: newHsla,
    });
    onChange(hex);
  };

  const handlePopoverChange = (open: boolean) => {
    if (!open) {
      setColorFormat(alpha ? "HEXA" : "HEX");
      onBlur();
    }
  };

  const isEyeDropperAvailable = () => {
    return typeof window !== "undefined" && "EyeDropper" in window;
  };

  const handleEyeDropper = async () => {
    if (!isEyeDropperAvailable()) {
      alert("Eyedropper is not supported in your browser");
      return;
    }
    try {
      // @ts-expect-error - TypeScript doesn't have types for EyeDropper yet
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      const pickedColor = result.sRGBHex;
      updateColorValues(pickedColor);
      onChange(pickedColor);
    } catch {
      return;
    }
  };

  useEffect(() => {
    updateColorValues(value);
    setHexInputValue(value.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const getCurrentHexValue = () => {
    if (colorFormat === "HEX" || colorFormat === "HEXA") {
      return hexInputValue;
    }
    if (alpha && colorValues.rgba) {
      return rgbaToHex(
        colorValues.rgba.r,
        colorValues.rgba.g,
        colorValues.rgba.b,
        colorValues.rgba.a,
      );
    }
    return colorValues.hex;
  };

  const inputError = error ?? (!hideInputValidation ? (hexInputError ?? undefined) : undefined);
  const inputPlaceholder = placeholder ?? (alpha ? "#FF0000FF" : "#FF0000");
  const swatchColor =
    alpha && colorValues.rgba
      ? rgbaToHex(colorValues.rgba.r, colorValues.rgba.g, colorValues.rgba.b, colorValues.rgba.a)
      : resolvedPickerValue;
  const swatch = (
    <span className="border-border relative size-3.5 overflow-hidden rounded-[calc(var(--radius-sm)-2px)] border">
      {alpha && colorValues.rgba && colorValues.rgba.a < 1 ? (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%),
                              linear-gradient(-45deg, #ccc 25%, transparent 25%),
                              linear-gradient(45deg, transparent 75%, #ccc 75%),
                              linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
            backgroundSize: "8px 8px",
            backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
          }}
        />
      ) : null}
      <span
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundColor: swatchColor }}
      />
    </span>
  );

  return (
    <div className={cn("space-y-2", className)}>
      {label ? <Label>{label}</Label> : null}
      <InputGroup className="w-full" data-disabled={disabled ? true : undefined}>
        <InputGroupAddon align="inline-start">
          <Popover onOpenChange={handlePopoverChange}>
            <InputGroupButton
              aria-label={`Choose ${resolvedLabel}`}
              isDisabled={disabled}
              size="sq-xs"
              intent="plain"
            >
              {swatch}
            </InputGroupButton>
            <PopoverContent className="w-auto p-3" placement="bottom start">
              <Dialog aria-label={`Choose ${resolvedLabel}`}>
                <div className="color-picker space-y-3">
                  <div className="relative">
                    <Button
                      intent="plain"
                      size="sq-xs"
                      className="absolute -top-1.5 -left-1 z-10 flex h-7 w-7 items-center gap-1 bg-transparent hover:bg-transparent"
                      onPress={() => void handleEyeDropper()}
                      isDisabled={disabled || !isEyeDropperAvailable()}
                    >
                      <ControlColorPickIcon className="h-3 w-3" />
                    </Button>
                    <ColorPicker
                      value={reactAriaPickerValue}
                      onChange={(nextColor) => handleColorChange(colorToHexValue(nextColor, alpha))}
                    >
                      <div className="flex w-[244.79px] flex-col gap-3">
                        <ColorSlider
                          aria-label={`${resolvedLabel} hue`}
                          channel="hue"
                          colorSpace="hsb"
                          className={cn(colorSliderClassName, "ml-8 w-[210px]")}
                          isDisabled={disabled}
                        >
                          <SliderTrack className={colorSliderTrackClassName}>
                            <ColorThumb className={colorSliderThumbClassName} />
                          </SliderTrack>
                        </ColorSlider>
                        <ColorArea
                          aria-label={`${resolvedLabel} saturation and brightness`}
                          colorSpace="hsb"
                          xChannel="saturation"
                          yChannel="brightness"
                          className={colorAreaClassName}
                          isDisabled={disabled}
                        >
                          <ColorThumb className={colorAreaThumbClassName} />
                        </ColorArea>
                        {alpha ? (
                          <ColorSlider
                            aria-label={`${resolvedLabel} alpha`}
                            channel="alpha"
                            className={cn(colorSliderClassName, "w-[244.79px]")}
                            isDisabled={disabled}
                          >
                            <SliderTrack className={colorSliderTrackClassName}>
                              <ColorThumb className={colorSliderThumbClassName} />
                            </SliderTrack>
                          </ColorSlider>
                        ) : null}
                      </div>
                    </ColorPicker>
                  </div>
                  <div className="flex gap-2">
                    <Select
                      aria-label="Color format"
                      isDisabled={disabled}
                      onSelectionChange={(format) => {
                        if (!format) {
                          return;
                        }

                        setColorFormat(format as ColorFormat);
                      }}
                      placeholder="Color"
                      selectedKey={colorFormat}
                    >
                      <SelectTrigger className="h-7! w-[4.8rem]! rounded-sm px-2 py-1 text-sm!" />
                      <SelectContent popover={{ className: "min-w-20" }}>
                        {alpha ? (
                          <>
                            <SelectItem id="HEXA" className="h-7 text-sm">
                              HEXA
                            </SelectItem>
                            <SelectItem id="RGBA" className="h-7 text-sm">
                              RGBA
                            </SelectItem>
                            <SelectItem id="HSLA" className="h-7 text-sm">
                              HSLA
                            </SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem id="HEX" className="h-7 text-sm">
                              HEX
                            </SelectItem>
                            <SelectItem id="RGB" className="h-7 text-sm">
                              RGB
                            </SelectItem>
                            <SelectItem id="HSL" className="h-7 text-sm">
                              HSL
                            </SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    {colorFormat === "HEX" || colorFormat === "HEXA" ? (
                      <Input
                        className="h-7 w-[160px] rounded-sm text-sm"
                        value={getCurrentHexValue()}
                        onChange={(e) => handleHexChange(e.target.value)}
                        placeholder={inputPlaceholder}
                        maxLength={9}
                      />
                    ) : colorFormat === "RGB" ? (
                      <div className="flex items-center">
                        <Input
                          className="h-7 w-13 rounded-l-sm rounded-r-none text-center text-sm"
                          value={colorValues.rgb.r}
                          onChange={(e) => handleRgbChange("r", e.target.value)}
                          placeholder="255"
                          maxLength={3}
                        />
                        <Input
                          className="h-7 w-13 rounded-none border-x-0 text-center text-sm"
                          value={colorValues.rgb.g}
                          onChange={(e) => handleRgbChange("g", e.target.value)}
                          placeholder="255"
                          maxLength={3}
                        />
                        <Input
                          className="h-7 w-13 rounded-l-none rounded-r-sm text-center text-sm"
                          value={colorValues.rgb.b}
                          onChange={(e) => handleRgbChange("b", e.target.value)}
                          placeholder="255"
                          maxLength={3}
                        />
                      </div>
                    ) : colorFormat === "RGBA" && alpha && colorValues.rgba ? (
                      <div className="flex items-center">
                        <Input
                          className="h-7 w-10 rounded-l-sm rounded-r-none px-1 text-center text-sm"
                          value={colorValues.rgba.r}
                          onChange={(e) => handleRgbaChange("r", e.target.value)}
                          placeholder="255"
                          maxLength={3}
                        />
                        <Input
                          className="h-7 w-10 rounded-none border-x-0 px-1 text-center text-sm"
                          value={colorValues.rgba.g}
                          onChange={(e) => handleRgbaChange("g", e.target.value)}
                          placeholder="255"
                          maxLength={3}
                        />
                        <Input
                          className="h-7 w-10 rounded-none border-x-0 px-1 text-center text-sm"
                          value={colorValues.rgba.b}
                          onChange={(e) => handleRgbaChange("b", e.target.value)}
                          placeholder="255"
                          maxLength={3}
                        />
                        <Input
                          className="h-7 w-10 rounded-l-none rounded-r-sm px-1 text-center text-sm"
                          value={colorValues.rgba.a.toFixed(2)}
                          onChange={(e) => handleRgbaChange("a", e.target.value)}
                          placeholder="1.00"
                          maxLength={4}
                        />
                      </div>
                    ) : colorFormat === "HSL" ? (
                      <div className="flex items-center">
                        <Input
                          className="h-7 w-13 rounded-l-sm rounded-r-none text-center text-sm"
                          value={colorValues.hsl.h}
                          onChange={(e) => handleHslChange("h", e.target.value)}
                          placeholder="360"
                          maxLength={3}
                        />
                        <Input
                          className="h-7 w-13 rounded-none border-x-0 text-center text-sm"
                          value={colorValues.hsl.s}
                          onChange={(e) => handleHslChange("s", e.target.value)}
                          placeholder="100"
                          maxLength={3}
                        />
                        <Input
                          className="h-7 w-13 rounded-l-none rounded-r-sm text-center text-sm"
                          value={colorValues.hsl.l}
                          onChange={(e) => handleHslChange("l", e.target.value)}
                          placeholder="100"
                          maxLength={3}
                        />
                      </div>
                    ) : colorFormat === "HSLA" && alpha && colorValues.hsla ? (
                      <div className="flex items-center">
                        <Input
                          className="h-7 w-10 rounded-l-sm rounded-r-none px-1 text-center text-sm"
                          value={colorValues.hsla.h}
                          onChange={(e) => handleHslaChange("h", e.target.value)}
                          placeholder="360"
                          maxLength={3}
                        />
                        <Input
                          className="h-7 w-10 rounded-none border-x-0 px-1 text-center text-sm"
                          value={colorValues.hsla.s}
                          onChange={(e) => handleHslaChange("s", e.target.value)}
                          placeholder="100"
                          maxLength={3}
                        />
                        <Input
                          className="h-7 w-10 rounded-none border-x-0 px-1 text-center text-sm"
                          value={colorValues.hsla.l}
                          onChange={(e) => handleHslaChange("l", e.target.value)}
                          placeholder="100"
                          maxLength={3}
                        />
                        <Input
                          className="h-7 w-10 rounded-l-none rounded-r-sm px-1 text-center text-sm"
                          value={colorValues.hsla.a.toFixed(2)}
                          onChange={(e) => handleHslaChange("a", e.target.value)}
                          placeholder="1.00"
                          maxLength={4}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </Dialog>
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
        <InputGroupInput
          aria-invalid={inputError ? true : undefined}
          aria-label={resolvedLabel}
          className="uppercase"
          disabled={disabled}
          name={name}
          onBlur={onBlur}
          onChange={(e) => handleHexChange(e.target.value)}
          placeholder={inputPlaceholder}
          required={required}
          type="text"
          value={getCurrentHexValue()}
        />
        {isLoading ? (
          <InputGroupAddon align="inline-end">
            <ControlLoadingIcon className="size-3.5 animate-spin" />
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {inputError ? <p className="text-destructive mt-1.5 text-sm">{inputError}</p> : null}
    </div>
  );
}
