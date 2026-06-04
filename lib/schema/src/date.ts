export function isDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function todayDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function compareDateStrings(left: string, right: string) {
  assertDateString(left, "Left date");
  assertDateString(right, "Right date");

  return left.localeCompare(right);
}

export function isDateBefore(left: string, right: string) {
  return compareDateStrings(left, right) < 0;
}

function assertDateString(value: string, label: string) {
  if (!isDateString(value)) {
    throw new Error(`${label} must be a YYYY-MM-DD date.`);
  }
}
