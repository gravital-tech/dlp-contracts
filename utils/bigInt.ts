export default function stringifyBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "bigint") {
    return obj.toString() + "n";
  }

  if (Array.isArray(obj)) {
    return obj.map(stringifyBigInt);
  }

  if (typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, stringifyBigInt(value)])
    );
  }

  return obj;
}
